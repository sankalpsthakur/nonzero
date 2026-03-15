// ---------------------------------------------------------------------------
// Shadow-Live Engine
// ---------------------------------------------------------------------------
// Shadow-live reads live Kite market data and live broker state (read-only),
// computes signals from deployed strategies, records what WOULD have been
// traded, and compares hypothetical fills against actual broker activity.
//
// No real orders are ever placed. The purpose is to validate that the
// strategy's signals and the execution engine's behavior match live reality
// before committing real capital.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import type {
  BrokerOrder,
  DateRange,
  DeployedStrategy,
  DivergenceMetrics,
  HypotheticalFill,
  MarketSnapshot,
  OpportunityCost,
  ShadowOrderIntent,
  Signal,
  Tick,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Estimate fill price from market snapshot using order book depth.
 * For BUY: walk up the ask side; for SELL: walk down the bid side.
 */
function estimateFillFromDepth(
  tick: Tick,
  quantity: number,
  side: "BUY" | "SELL",
): { price: number; confidence: number } {
  const depth = side === "BUY" ? tick.sellDepth : tick.buyDepth;

  if (!depth || depth.length === 0) {
    return { price: tick.lastPrice, confidence: 0.5 };
  }

  let remainingQty = quantity;
  let totalCost = 0;
  let levelsUsed = 0;

  for (const level of depth) {
    const fillQty = Math.min(remainingQty, level.quantity);
    totalCost += fillQty * level.price;
    remainingQty -= fillQty;
    levelsUsed++;

    if (remainingQty <= 0) break;
  }

  // If we couldn't fill the full quantity from visible depth, extrapolate
  if (remainingQty > 0) {
    const lastLevel = depth[depth.length - 1];
    if (lastLevel) {
      // Add a premium/discount for the unfilled portion
      const slippageMultiplier = side === "BUY" ? 1.001 : 0.999;
      totalCost += remainingQty * lastLevel.price * slippageMultiplier;
    } else {
      totalCost += remainingQty * tick.lastPrice;
    }
  }

  const avgPrice = totalCost / quantity;
  // Confidence decreases with the number of depth levels needed
  const confidence = Math.max(0.1, 1 - levelsUsed * 0.15);

  return {
    price: Math.round(avgPrice * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Shadow Live Engine
// ---------------------------------------------------------------------------

export class ShadowLiveEngine {
  private shadowIntents: ShadowOrderIntent[] = [];
  private hypotheticalFills: Map<string, HypotheticalFill> = new Map();

  // -------------------------------------------------------------------------
  // Signal computation
  // -------------------------------------------------------------------------

  /**
   * Run a deployed strategy's signal generation against a market snapshot.
   *
   * In production, this would execute the strategy's code snapshot in a
   * sandboxed environment. For now, it evaluates the strategy's configuration
   * against the market data to produce signals.
   *
   * The strategy code is expected to export a `generateSignals` function
   * that takes market data and returns an array of signals.
   */
  computeSignals(
    strategy: DeployedStrategy,
    marketData: MarketSnapshot,
  ): Signal[] {
    const signals: Signal[] = [];

    // Iterate over the strategy's universe and compute signals
    for (const symbol of strategy.universe) {
      const tick = marketData.ticks.get(symbol);
      if (!tick) continue;

      // The actual signal computation would be done by executing the
      // strategy's code snapshot. This is a structural placeholder that
      // shows how signals flow through the system.
      //
      // In the real implementation, this would:
      // 1. Load the strategy code from codeSnapshot
      // 2. Execute it in a sandboxed context with the market data
      // 3. Collect the emitted signals
      //
      // For now, we create a HOLD signal to indicate the strategy was evaluated
      // but the actual logic is delegated to the strategy code runtime.
      const signal: Signal = {
        id: generateId(),
        deploymentId: strategy.deploymentId,
        strategyVersionId: strategy.strategyVersionId,
        symbol: tick.tradingSymbol,
        exchange: tick.exchange,
        action: "HOLD",
        strength: 0,
        suggestedQuantity: 0,
        timestamp: marketData.timestamp,
        metadata: {
          lastPrice: tick.lastPrice,
          volume: tick.volume,
          ohlc: tick.ohlc,
          strategyConfig: strategy.config,
        },
      };

      signals.push(signal);
    }

    return signals;
  }

  // -------------------------------------------------------------------------
  // Shadow intent recording
  // -------------------------------------------------------------------------

  /**
   * Record a shadow order intent — what WOULD have been traded based on
   * the strategy's signal. This is the core of shadow-live: we capture
   * the full intent so we can later compare against actual execution.
   */
  async recordShadowIntent(
    signal: Signal,
  ): Promise<ShadowOrderIntent> {
    // Only record actionable signals (BUY or SELL, not HOLD)
    if (signal.action === "HOLD") {
      // Still record it for completeness, but mark it as non-actionable
    }

    const intent: ShadowOrderIntent = {
      id: generateId(),
      deploymentId: signal.deploymentId,
      signal,
      intent: {
        deploymentId: signal.deploymentId,
        workspaceId: "", // Populated by caller
        symbol: signal.symbol,
        exchange: signal.exchange as ShadowOrderIntent["intent"]["exchange"],
        transactionType: signal.action === "BUY" ? "BUY" : "SELL",
        orderType: signal.targetPrice ? "LIMIT" : "MARKET",
        quantity: signal.suggestedQuantity,
        price: signal.targetPrice,
        product: "CNC",
        signalId: signal.id,
        signalTimestamp: signal.timestamp,
      },
      recordedAt: new Date(),
      marketSnapshot: {
        symbol: signal.symbol,
        lastPrice: (signal.metadata?.lastPrice as number) ?? 0,
        bidPrice: 0,
        askPrice: 0,
        timestamp: signal.timestamp,
      },
    };

    this.shadowIntents.push(intent);

    // Persist to database as a divergence-related event
    try {
      await db.runEvent.create({
        data: {
          runId: signal.deploymentId, // Using deployment as run reference
          type: "METRIC",
          payload: {
            type: "shadow_intent",
            shadowIntentId: intent.id,
            signal: {
              id: signal.id,
              symbol: signal.symbol,
              action: signal.action,
              strength: signal.strength,
              quantity: signal.suggestedQuantity,
            },
            marketSnapshot: intent.marketSnapshot,
            recordedAt: intent.recordedAt.toISOString(),
          },
        },
      });
    } catch {
      // Non-fatal: shadow recording should not break the flow
    }

    return intent;
  }

  // -------------------------------------------------------------------------
  // Hypothetical fill computation
  // -------------------------------------------------------------------------

  /**
   * Compute what a fill WOULD have looked like for a shadow intent,
   * using the market data at the time of the signal.
   *
   * Uses order book depth to estimate realistic fill prices, accounting
   * for the order's size impact on the book.
   */
  computeHypotheticalFill(
    intent: ShadowOrderIntent,
    marketData: MarketSnapshot,
  ): HypotheticalFill {
    const tick = marketData.ticks.get(intent.signal.symbol);

    let estimatedFillPrice: number;
    let fillConfidence: number;

    if (tick && intent.intent.quantity > 0) {
      // Use order book depth for realistic fill estimation
      const depthEstimate = estimateFillFromDepth(
        tick,
        intent.intent.quantity,
        intent.signal.action === "BUY" ? "BUY" : "SELL",
      );
      estimatedFillPrice = depthEstimate.price;
      fillConfidence = depthEstimate.confidence;
    } else {
      // Fall back to the market snapshot price
      estimatedFillPrice = intent.marketSnapshot.lastPrice;
      fillConfidence = 0.3;
    }

    // Estimate slippage
    const estimatedSlippage = Math.abs(
      estimatedFillPrice - intent.marketSnapshot.lastPrice,
    );

    // Estimate fees (Zerodha-like fee structure)
    const turnover = intent.intent.quantity * estimatedFillPrice;
    const estimatedFees = Math.round(turnover * 0.00015 * 100) / 100;

    const fill: HypotheticalFill = {
      shadowIntentId: intent.id,
      estimatedFillPrice,
      estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
      estimatedFees,
      fillConfidence,
      timestamp: new Date(),
    };

    this.hypotheticalFills.set(intent.id, fill);
    return fill;
  }

  // -------------------------------------------------------------------------
  // Opportunity cost measurement
  // -------------------------------------------------------------------------

  /**
   * Measure the opportunity cost of NOT executing a shadow intent.
   *
   * This compares:
   * - What P&L the shadow trade would have generated (hypothetical)
   * - What P&L the actual broker order generated (if any)
   * - The delta = missed alpha
   *
   * This is the most actionable metric for deciding when to promote
   * a strategy from shadow-live to live.
   */
  measureOpportunityCost(
    shadow: ShadowOrderIntent,
    actual?: BrokerOrder,
  ): OpportunityCost {
    const hypotheticalFill = this.hypotheticalFills.get(shadow.id);
    const hypotheticalPrice =
      hypotheticalFill?.estimatedFillPrice ??
      shadow.marketSnapshot.lastPrice;

    // Hypothetical P&L: based on the shadow fill price and current market
    // For a complete calculation, we'd need the exit price. For now,
    // compute based on the fill quality vs. the signal's target.
    let hypotheticalPnl = 0;
    if (shadow.signal.targetPrice && shadow.signal.action !== "HOLD") {
      const direction = shadow.signal.action === "BUY" ? 1 : -1;
      hypotheticalPnl =
        direction *
        (shadow.signal.targetPrice - hypotheticalPrice) *
        shadow.intent.quantity;
      // Subtract estimated fees
      hypotheticalPnl -= hypotheticalFill?.estimatedFees ?? 0;
    }

    // Actual P&L from the real broker order (if one exists)
    let actualPnl: number | undefined;
    let executionDelay: number | undefined;
    let priceDelta: number | undefined;

    if (actual) {
      // Execution delay: time between shadow signal and actual order placement
      executionDelay =
        actual.placedAt.getTime() - shadow.signal.timestamp.getTime();

      // Price delta: difference between shadow's estimated fill and actual fill
      priceDelta = actual.averagePrice - hypotheticalPrice;

      // Actual P&L estimation (simplified)
      if (shadow.signal.targetPrice) {
        const direction = shadow.signal.action === "BUY" ? 1 : -1;
        actualPnl =
          direction *
          (shadow.signal.targetPrice - actual.averagePrice) *
          actual.filledQuantity;
      }
    }

    const missedAlpha =
      hypotheticalPnl - (actualPnl ?? 0);

    return {
      shadowIntentId: shadow.id,
      hypotheticalPnl: Math.round(hypotheticalPnl * 100) / 100,
      actualPnl:
        actualPnl !== undefined
          ? Math.round(actualPnl * 100) / 100
          : undefined,
      missedAlpha: Math.round(missedAlpha * 100) / 100,
      executionDelay,
      priceDelta:
        priceDelta !== undefined
          ? Math.round(priceDelta * 100) / 100
          : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Divergence monitoring
  // -------------------------------------------------------------------------

  /**
   * Monitor divergence between shadow execution and live execution
   * for a given deployment. Aggregates divergence reports over a
   * configurable window.
   *
   * This is the live-vs-expected comparison that tells operators
   * whether the strategy is behaving as modeled.
   */
  async divergenceMonitor(
    deploymentId: string,
  ): Promise<DivergenceMetrics> {
    // Load recent divergence reports from the database
    const reports = await db.divergenceReport.findMany({
      where: { deploymentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (reports.length === 0) {
      return {
        deploymentId,
        reportCount: 0,
        averageDivergenceScore: 0,
        maxDivergenceScore: 0,
        averageEntryTimeDelta: 0,
        averagePriceDelta: 0,
        cumulativePnlDelta: 0,
        trend: "stable",
        currentSeverity: "LOW",
        period: { from: new Date(), to: new Date() },
      };
    }

    // Compute aggregate metrics
    let totalDivergenceScore = 0;
    let maxDivergenceScore = 0;
    let totalEntryTimeDelta = 0;
    let entryTimeDeltaCount = 0;
    let totalPriceDelta = 0;
    let priceDeltaCount = 0;
    let cumulativePnlDelta = 0;

    for (const report of reports) {
      totalDivergenceScore += report.divergenceScore;
      maxDivergenceScore = Math.max(
        maxDivergenceScore,
        report.divergenceScore,
      );

      if (report.entryTimeDelta !== null) {
        totalEntryTimeDelta += report.entryTimeDelta;
        entryTimeDeltaCount++;
      }

      if (report.priceDelta !== null) {
        totalPriceDelta += Math.abs(report.priceDelta);
        priceDeltaCount++;
      }

      if (report.pnlDelta !== null) {
        cumulativePnlDelta += report.pnlDelta;
      }
    }

    // Determine trend by comparing first half vs second half of reports
    const midpoint = Math.floor(reports.length / 2);
    const recentAvg =
      reports.length > 1
        ? reports
            .slice(0, midpoint)
            .reduce((sum, r) => sum + r.divergenceScore, 0) / midpoint
        : 0;
    const olderAvg =
      reports.length > 1
        ? reports
            .slice(midpoint)
            .reduce((sum, r) => sum + r.divergenceScore, 0) /
          (reports.length - midpoint)
        : 0;

    let trend: "increasing" | "stable" | "decreasing";
    const trendThreshold = 0.15; // 15% change threshold
    if (olderAvg === 0) {
      trend = "stable";
    } else if ((recentAvg - olderAvg) / olderAvg > trendThreshold) {
      trend = "increasing";
    } else if ((olderAvg - recentAvg) / olderAvg > trendThreshold) {
      trend = "decreasing";
    } else {
      trend = "stable";
    }

    const mostRecent = reports[0];
    const oldest = reports[reports.length - 1];

    return {
      deploymentId,
      reportCount: reports.length,
      averageDivergenceScore:
        Math.round((totalDivergenceScore / reports.length) * 100) / 100,
      maxDivergenceScore,
      averageEntryTimeDelta:
        entryTimeDeltaCount > 0
          ? Math.round(totalEntryTimeDelta / entryTimeDeltaCount)
          : 0,
      averagePriceDelta:
        priceDeltaCount > 0
          ? Math.round((totalPriceDelta / priceDeltaCount) * 100) / 100
          : 0,
      cumulativePnlDelta: Math.round(cumulativePnlDelta * 100) / 100,
      trend,
      currentSeverity: mostRecent.severity,
      period: {
        from: oldest.createdAt,
        to: mostRecent.createdAt,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Persist a divergence report to the database.
   */
  async persistDivergenceReport(
    report: Omit<
      Parameters<typeof db.divergenceReport.create>[0]["data"],
      "id"
    >,
  ): Promise<string> {
    const created = await db.divergenceReport.create({
      data: report,
    });
    return created.id;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** Get all recorded shadow intents. */
  getShadowIntents(): ShadowOrderIntent[] {
    return [...this.shadowIntents];
  }

  /** Get shadow intents for a specific deployment. */
  getShadowIntentsForDeployment(
    deploymentId: string,
  ): ShadowOrderIntent[] {
    return this.shadowIntents.filter(
      (si) => si.deploymentId === deploymentId,
    );
  }

  /** Get the hypothetical fill for a shadow intent. */
  getHypotheticalFill(
    shadowIntentId: string,
  ): HypotheticalFill | undefined {
    return this.hypotheticalFills.get(shadowIntentId);
  }

  /** Get summary stats for shadow intents of a deployment. */
  getShadowSummary(deploymentId: string): {
    totalIntents: number;
    buyIntents: number;
    sellIntents: number;
    holdIntents: number;
    averageStrength: number;
    totalHypotheticalValue: number;
  } {
    const intents = this.getShadowIntentsForDeployment(deploymentId);

    let buyCount = 0;
    let sellCount = 0;
    let holdCount = 0;
    let totalStrength = 0;
    let totalValue = 0;

    for (const intent of intents) {
      if (intent.signal.action === "BUY") buyCount++;
      else if (intent.signal.action === "SELL") sellCount++;
      else holdCount++;

      totalStrength += intent.signal.strength;

      const fill = this.hypotheticalFills.get(intent.id);
      if (fill) {
        totalValue += fill.estimatedFillPrice * intent.intent.quantity;
      }
    }

    return {
      totalIntents: intents.length,
      buyIntents: buyCount,
      sellIntents: sellCount,
      holdIntents: holdCount,
      averageStrength:
        intents.length > 0
          ? Math.round((totalStrength / intents.length) * 100) / 100
          : 0,
      totalHypotheticalValue: Math.round(totalValue * 100) / 100,
    };
  }

  /** Clear in-memory shadow state (does not affect database records). */
  reset(): void {
    this.shadowIntents = [];
    this.hypotheticalFills.clear();
  }
}
