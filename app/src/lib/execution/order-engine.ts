// ---------------------------------------------------------------------------
// Order Execution Engine
// ---------------------------------------------------------------------------
// The SHARED execution engine used by paper, shadow-live, and live deployments.
// This is the critical piece that enforces "no divergent execution logic":
// every environment runs intents through the same validation, risk checks,
// and routing code — only the broker adapter at the end of the pipeline differs.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import type {
  BrokerAdapter,
  DivergenceReport,
  OrderIntent,
  OrderResult,
  Position,
  ReconciliationResult,
  RiskPolicy,
  TradeLog,
  ValidationResult,
} from "./types";
import { RiskEngine } from "./risk-engine";

// ---------------------------------------------------------------------------
// Order Engine
// ---------------------------------------------------------------------------

export class OrderEngine {
  private broker: BrokerAdapter;
  private riskEngine: RiskEngine;

  constructor(broker: BrokerAdapter, riskEngine: RiskEngine) {
    this.broker = broker;
    this.riskEngine = riskEngine;
  }

  // -------------------------------------------------------------------------
  // Submit intent — the main entry point
  // -------------------------------------------------------------------------

  /**
   * Submit an order intent through the full execution pipeline:
   * 1. Validate the intent (field-level validation)
   * 2. Run pre-trade risk checks against all active policies
   * 3. Persist the intent to the database
   * 4. Route to the broker adapter
   * 5. Record the result
   *
   * This method is environment-agnostic. The broker adapter determines
   * whether a real order, paper fill, or shadow recording happens.
   */
  async submitIntent(intent: OrderIntent): Promise<OrderResult> {
    // Step 1: Field-level validation
    const validation = this.validateOrderFields(intent);
    if (!validation.valid) {
      return {
        intentId: intent.id ?? "",
        status: "REJECTED",
        message: `Validation failed: ${validation.errors.join("; ")}`,
        validationErrors: validation.errors,
        timestamp: new Date(),
      };
    }

    // Step 2: Load active risk policies and run pre-trade checks
    const policies = await this.loadActivePolicies(intent.workspaceId);
    const riskCheck = await this.riskEngine.checkPreTrade(intent, policies);

    if (!riskCheck.passed) {
      // Persist the rejected intent
      const dbIntent = await this.persistIntent(intent, "REJECTED");

      return {
        intentId: dbIntent.id,
        status: "REJECTED",
        message: `Risk check failed: ${riskCheck.rejectionReasons.join("; ")}`,
        validationErrors: riskCheck.rejectionReasons,
        timestamp: new Date(),
      };
    }

    // Step 3: Persist the intent as APPROVED (passed all checks)
    const dbIntent = await this.persistIntent(intent, "APPROVED");
    const enrichedIntent: OrderIntent = { ...intent, id: dbIntent.id };

    // Step 4: Route to broker adapter
    let result: OrderResult;
    try {
      result = await this.broker.placeOrder(enrichedIntent);
      result.intentId = dbIntent.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown broker error";

      // Update intent status to REJECTED on broker failure
      await this.updateIntentStatus(dbIntent.id, "REJECTED");

      return {
        intentId: dbIntent.id,
        status: "REJECTED",
        message: `Broker error: ${message}`,
        timestamp: new Date(),
      };
    }

    // Step 5: Record the result
    await this.updateIntentStatus(dbIntent.id, result.status);

    if (result.brokerOrderId) {
      await this.persistBrokerOrder(dbIntent.id, result);
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate order intent fields and run against risk policies.
   * Used both internally and exposed for dry-run validation.
   */
  async validateOrder(
    intent: OrderIntent,
    policies: RiskPolicy[],
  ): Promise<ValidationResult> {
    const fieldValidation = this.validateOrderFields(intent);
    if (!fieldValidation.valid) {
      return fieldValidation;
    }

    const riskCheck = await this.riskEngine.checkPreTrade(intent, policies);
    if (!riskCheck.passed) {
      return {
        valid: false,
        errors: riskCheck.rejectionReasons,
        warnings: [],
      };
    }

    return { valid: true, errors: [], warnings: fieldValidation.warnings };
  }

  /**
   * Field-level validation: ensures the intent has valid values
   * independent of risk policies.
   */
  private validateOrderFields(intent: OrderIntent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!intent.symbol || intent.symbol.trim() === "") {
      errors.push("Symbol is required");
    }

    if (!intent.exchange) {
      errors.push("Exchange is required");
    }

    if (!intent.transactionType) {
      errors.push("Transaction type is required");
    }

    if (!intent.quantity || intent.quantity <= 0) {
      errors.push("Quantity must be a positive integer");
    } else if (!Number.isInteger(intent.quantity)) {
      errors.push("Quantity must be an integer");
    }

    if (intent.orderType === "LIMIT" && intent.price === undefined) {
      errors.push("Price is required for LIMIT orders");
    }

    if (
      (intent.orderType === "SL" || intent.orderType === "SL_M") &&
      intent.triggerPrice === undefined
    ) {
      errors.push("Trigger price is required for SL/SL-M orders");
    }

    if (intent.price !== undefined && intent.price <= 0) {
      errors.push("Price must be positive");
    }

    if (intent.triggerPrice !== undefined && intent.triggerPrice <= 0) {
      errors.push("Trigger price must be positive");
    }

    if (!intent.deploymentId) {
      errors.push("Deployment ID is required");
    }

    if (!intent.workspaceId) {
      errors.push("Workspace ID is required");
    }

    // Warnings (non-blocking)
    if (intent.quantity > 10000) {
      warnings.push(
        `Large order quantity: ${intent.quantity}. Verify this is intentional.`,
      );
    }

    if (
      intent.orderType === "MARKET" &&
      intent.product === "CNC"
    ) {
      warnings.push(
        "Market order with CNC product — consider using LIMIT for better fill prices.",
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  /**
   * Compare expected positions (from the execution engine's records)
   * with actual positions (from the broker).
   *
   * This is the heartbeat of correctness: if expected and actual diverge,
   * something is wrong with the execution model.
   */
  reconcilePositions(
    expected: Position[],
    actual: Position[],
  ): ReconciliationResult {
    const expectedMap = new Map<string, Position>();
    for (const p of expected) {
      expectedMap.set(`${p.exchange}:${p.symbol}`, p);
    }

    const actualMap = new Map<string, Position>();
    for (const p of actual) {
      actualMap.set(`${p.exchange}:${p.symbol}`, p);
    }

    const matched: ReconciliationResult["matched"] = [];
    const mismatched: ReconciliationResult["mismatched"] = [];
    const missing: ReconciliationResult["missing"] = [];
    const unexpected: ReconciliationResult["unexpected"] = [];

    // Check all expected positions
    for (const [key, exp] of expectedMap) {
      const act = actualMap.get(key);
      if (!act) {
        missing.push({
          symbol: exp.symbol,
          expectedQuantity: exp.quantity,
        });
      } else if (act.quantity === exp.quantity) {
        matched.push({
          symbol: exp.symbol,
          expectedQuantity: exp.quantity,
          actualQuantity: act.quantity,
        });
      } else {
        mismatched.push({
          symbol: exp.symbol,
          expectedQuantity: exp.quantity,
          actualQuantity: act.quantity,
          quantityDelta: act.quantity - exp.quantity,
          priceDelta:
            act.averagePrice !== 0 && exp.averagePrice !== 0
              ? act.averagePrice - exp.averagePrice
              : undefined,
        });
      }
    }

    // Check for positions in actual but not in expected
    for (const [key, act] of actualMap) {
      if (!expectedMap.has(key)) {
        unexpected.push({
          symbol: act.symbol,
          actualQuantity: act.quantity,
        });
      }
    }

    return {
      timestamp: new Date(),
      matched,
      mismatched,
      missing,
      unexpected,
      reconciled:
        mismatched.length === 0 &&
        missing.length === 0 &&
        unexpected.length === 0,
    };
  }

  // -------------------------------------------------------------------------
  // Divergence computation
  // -------------------------------------------------------------------------

  /**
   * Compute divergence between expected trade log and actual trade log.
   * This is the spec's most important live feature: it answers
   * "is the live system doing what the model predicted?"
   */
  computeDivergence(
    expected: TradeLog,
    actual: TradeLog,
  ): DivergenceReport {
    const expectedEntries = expected.entries;
    const actualEntries = actual.entries;

    // Match entries by symbol + transaction type + approximate timestamp
    let totalEntryTimeDelta = 0;
    let totalPriceDelta = 0;
    let matchCount = 0;
    let unmatchedExpected = 0;
    let unmatchedActual = 0;

    const actualUsed = new Set<number>();

    for (const exp of expectedEntries) {
      // Find the closest matching actual entry
      let bestMatch: { index: number; timeDelta: number } | null = null;

      for (let i = 0; i < actualEntries.length; i++) {
        if (actualUsed.has(i)) continue;
        const act = actualEntries[i];

        if (
          act.symbol === exp.symbol &&
          act.transactionType === exp.transactionType
        ) {
          const timeDelta = Math.abs(
            act.timestamp.getTime() - exp.timestamp.getTime(),
          );
          if (!bestMatch || timeDelta < bestMatch.timeDelta) {
            bestMatch = { index: i, timeDelta };
          }
        }
      }

      if (bestMatch) {
        actualUsed.add(bestMatch.index);
        const act = actualEntries[bestMatch.index];
        totalEntryTimeDelta += bestMatch.timeDelta;
        totalPriceDelta += Math.abs(act.price - exp.price);
        matchCount++;
      } else {
        unmatchedExpected++;
      }
    }

    unmatchedActual = actualEntries.length - actualUsed.size;

    // Compute aggregate metrics
    const avgEntryTimeDelta =
      matchCount > 0 ? totalEntryTimeDelta / matchCount : null;
    const avgPriceDelta =
      matchCount > 0 ? totalPriceDelta / matchCount : null;

    // Fill rate delta: fraction of expected trades that got matched
    const expectedFillRate =
      expectedEntries.length > 0
        ? matchCount / expectedEntries.length
        : 1;
    const fillRateDelta = 1 - expectedFillRate;

    // Position delta: compare net position sizes
    const expectedNetPositions = this.computeNetPositions(expectedEntries);
    const actualNetPositions = this.computeNetPositions(
      actualEntries.filter((_, i) => actualUsed.has(i)),
    );
    let positionDelta = 0;
    for (const [symbol, expectedQty] of expectedNetPositions) {
      const actualQty = actualNetPositions.get(symbol) ?? 0;
      positionDelta += Math.abs(actualQty - expectedQty);
    }

    // P&L delta
    const expectedPnl = this.computeTradeLogPnl(expectedEntries);
    const actualPnl = this.computeTradeLogPnl(
      actualEntries.filter((_, i) => actualUsed.has(i)),
    );
    const pnlDelta = actualPnl - expectedPnl;

    // Composite divergence score (0 = identical, higher = worse)
    const divergenceScore = this.computeDivergenceScore({
      entryTimeDelta: avgEntryTimeDelta,
      priceDelta: avgPriceDelta,
      fillRateDelta,
      positionDelta,
      pnlDelta,
      unmatchedExpected,
      unmatchedActual,
    });

    const severity = this.classifySeverity(divergenceScore);

    return {
      deploymentId: expected.deploymentId,
      workspaceId: "",
      entryTimeDelta: avgEntryTimeDelta,
      priceDelta: avgPriceDelta,
      fillRateDelta,
      positionDelta,
      pnlDelta,
      divergenceScore,
      severity,
      timestamp: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private computeNetPositions(
    entries: TradeLog["entries"],
  ): Map<string, number> {
    const positions = new Map<string, number>();
    for (const e of entries) {
      const key = `${e.exchange}:${e.symbol}`;
      const current = positions.get(key) ?? 0;
      const delta = e.transactionType === "BUY" ? e.quantity : -e.quantity;
      positions.set(key, current + delta);
    }
    return positions;
  }

  private computeTradeLogPnl(entries: TradeLog["entries"]): number {
    // Simplified P&L: sum of (sell_value - buy_value) for matched trades
    let pnl = 0;
    for (const e of entries) {
      const value = e.quantity * e.price;
      pnl += e.transactionType === "SELL" ? value - e.fees : -(value + e.fees);
    }
    return pnl;
  }

  private computeDivergenceScore(metrics: {
    entryTimeDelta: number | null;
    priceDelta: number | null;
    fillRateDelta: number;
    positionDelta: number;
    pnlDelta: number;
    unmatchedExpected: number;
    unmatchedActual: number;
  }): number {
    let score = 0;

    // Time divergence: penalize > 1s delays
    if (metrics.entryTimeDelta !== null) {
      score += Math.min(metrics.entryTimeDelta / 1000, 10) * 2;
    }

    // Price divergence: penalize > 0.1% price delta
    if (metrics.priceDelta !== null) {
      score += Math.min(metrics.priceDelta * 100, 10) * 3;
    }

    // Fill rate divergence
    score += metrics.fillRateDelta * 20;

    // Position divergence
    score += Math.min(metrics.positionDelta, 10) * 2;

    // P&L divergence: penalize large P&L deltas
    score += Math.min(Math.abs(metrics.pnlDelta) / 1000, 10) * 1;

    // Unmatched trades
    score += (metrics.unmatchedExpected + metrics.unmatchedActual) * 3;

    return Math.round(score * 100) / 100;
  }

  private classifySeverity(
    score: number,
  ): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (score < 5) return "LOW";
    if (score < 15) return "MEDIUM";
    if (score < 30) return "HIGH";
    return "CRITICAL";
  }

  private async loadActivePolicies(
    workspaceId: string,
  ): Promise<RiskPolicy[]> {
    const policies = await db.riskPolicy.findMany({
      where: { workspaceId, isActive: true },
    });

    return policies.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      name: p.name,
      type: p.type,
      threshold: Number(p.threshold),
      isActive: p.isActive,
    }));
  }

  private async persistIntent(
    intent: OrderIntent,
    status: "PENDING" | "APPROVED" | "REJECTED",
  ) {
    return db.orderIntent.create({
      data: {
        deploymentId: intent.deploymentId,
        workspaceId: intent.workspaceId,
        symbol: intent.symbol,
        exchange: intent.exchange,
        transactionType: intent.transactionType,
        orderType: intent.orderType,
        quantity: intent.quantity,
        price: intent.price,
        triggerPrice: intent.triggerPrice,
        product: intent.product,
        status,
      },
    });
  }

  private async updateIntentStatus(
    intentId: string,
    status: string,
  ): Promise<void> {
    try {
      await db.orderIntent.update({
        where: { id: intentId },
        data: {
          status: status as "PENDING" | "APPROVED" | "SUBMITTED" | "FILLED" | "REJECTED" | "CANCELLED",
          ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
        },
      });
    } catch {
      // Non-fatal: log but don't block execution
    }
  }

  private async persistBrokerOrder(
    intentId: string,
    result: OrderResult,
  ): Promise<void> {
    try {
      await db.brokerOrder.create({
        data: {
          orderIntentId: intentId,
          brokerOrderId: result.brokerOrderId!,
          status: result.status,
          filledQuantity:
            result.status === "FILLED"
              ? 0 // Will be updated by order status polling
              : 0,
          placedAt: result.timestamp,
        },
      });
    } catch {
      // Non-fatal
    }
  }
}
