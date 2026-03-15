// ---------------------------------------------------------------------------
// Risk Control Engine
// ---------------------------------------------------------------------------
// Enforces risk policies at pre-trade and portfolio levels. This engine
// runs BEFORE every order hits the broker adapter, regardless of whether
// the adapter is live, paper, or shadow. The kill switch provides emergency
// stop capability for live deployments.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import type {
  ExposureInfo,
  KillSwitchResult,
  OrderIntent,
  PortfolioRiskCheck,
  Position,
  RiskCheck,
  RiskCheckResult,
  RiskPolicy,
} from "./types";

// ---------------------------------------------------------------------------
// Risk Engine
// ---------------------------------------------------------------------------

export class RiskEngine {
  // -------------------------------------------------------------------------
  // Pre-trade checks
  // -------------------------------------------------------------------------

  /**
   * Run all active risk policies against an order intent BEFORE it reaches
   * the broker. If any check fails, the order is rejected.
   *
   * Checks performed (depending on active policies):
   * - MAX_ORDER_SIZE: single order quantity/value limit
   * - MAX_CAPITAL: total capital at risk
   * - MAX_DAILY_LOSS: daily P&L floor
   * - MAX_EXPOSURE: per-symbol or total exposure limit
   * - MAX_CONCURRENT: maximum number of open positions
   * - MAX_SLIPPAGE: estimated slippage threshold
   */
  async checkPreTrade(
    intent: OrderIntent,
    policies: RiskPolicy[],
  ): Promise<RiskCheck> {
    const checks: RiskCheckResult[] = [];
    const rejectionReasons: string[] = [];

    for (const policy of policies) {
      if (!policy.isActive) continue;

      let result: RiskCheckResult;

      switch (policy.type) {
        case "MAX_ORDER_SIZE":
          result = await this.checkMaxOrderSize(intent, policy);
          break;
        case "MAX_CAPITAL":
          result = await this.checkMaxCapital(intent, policy);
          break;
        case "MAX_DAILY_LOSS":
          result = await this.checkMaxDailyLoss(intent, policy);
          break;
        case "MAX_EXPOSURE":
          result = await this.checkMaxExposure(intent, policy);
          break;
        case "MAX_CONCURRENT":
          result = await this.checkMaxConcurrent(intent, policy);
          break;
        case "MAX_SLIPPAGE":
          result = this.checkMaxSlippage(intent, policy);
          break;
        default:
          result = {
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.type,
            passed: true,
            currentValue: 0,
            threshold: policy.threshold,
            message: `Unknown policy type: ${policy.type}`,
          };
      }

      checks.push(result);
      if (!result.passed) {
        rejectionReasons.push(result.message);
      }
    }

    return {
      passed: rejectionReasons.length === 0,
      checks,
      rejectionReasons,
      timestamp: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Portfolio-level checks
  // -------------------------------------------------------------------------

  /**
   * Check portfolio-level risk limits across all positions.
   * This is a broader check than pre-trade, evaluating the entire portfolio
   * state against aggregate policies.
   */
  async checkPortfolioLimits(
    positions: Position[],
    policies: RiskPolicy[],
  ): Promise<PortfolioRiskCheck> {
    const checks: RiskCheckResult[] = [];
    const exposureBySymbol = new Map<string, number>();

    // Compute exposure per symbol
    let totalExposure = 0;
    for (const pos of positions) {
      const absValue = Math.abs(pos.quantity * pos.lastPrice);
      exposureBySymbol.set(
        `${pos.exchange}:${pos.symbol}`,
        absValue,
      );
      totalExposure += absValue;
    }

    // Get daily P&L
    const dailyPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

    for (const policy of policies) {
      if (!policy.isActive) continue;

      switch (policy.type) {
        case "MAX_CAPITAL": {
          checks.push({
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.type,
            passed: totalExposure <= policy.threshold,
            currentValue: totalExposure,
            threshold: policy.threshold,
            message:
              totalExposure > policy.threshold
                ? `Total exposure ${totalExposure} exceeds capital limit ${policy.threshold}`
                : `Total exposure ${totalExposure} within capital limit`,
          });
          break;
        }
        case "MAX_DAILY_LOSS": {
          // Threshold is a positive number representing max loss allowed
          const lossExceeded = dailyPnl < -policy.threshold;
          checks.push({
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.type,
            passed: !lossExceeded,
            currentValue: dailyPnl,
            threshold: policy.threshold,
            message: lossExceeded
              ? `Daily P&L ${dailyPnl} exceeds max daily loss limit -${policy.threshold}`
              : `Daily P&L ${dailyPnl} within max daily loss limit`,
          });
          break;
        }
        case "MAX_EXPOSURE": {
          // Check each symbol's exposure against the limit
          for (const [symbol, exposure] of exposureBySymbol) {
            if (exposure > policy.threshold) {
              checks.push({
                policyId: policy.id,
                policyName: policy.name,
                policyType: policy.type,
                passed: false,
                currentValue: exposure,
                threshold: policy.threshold,
                message: `Symbol ${symbol} exposure ${exposure} exceeds limit ${policy.threshold}`,
              });
            }
          }
          // If no symbol exceeded, add a passing check
          const anyExceeded = Array.from(exposureBySymbol.values()).some(
            (v) => v > policy.threshold,
          );
          if (!anyExceeded) {
            checks.push({
              policyId: policy.id,
              policyName: policy.name,
              policyType: policy.type,
              passed: true,
              currentValue: Math.max(
                0,
                ...Array.from(exposureBySymbol.values()),
              ),
              threshold: policy.threshold,
              message: "All symbol exposures within limit",
            });
          }
          break;
        }
        case "MAX_CONCURRENT": {
          const openPositions = positions.filter(
            (p) => p.quantity !== 0,
          ).length;
          checks.push({
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.type,
            passed: openPositions <= policy.threshold,
            currentValue: openPositions,
            threshold: policy.threshold,
            message:
              openPositions > policy.threshold
                ? `Open positions ${openPositions} exceeds max concurrent limit ${policy.threshold}`
                : `Open positions ${openPositions} within concurrent limit`,
          });
          break;
        }
      }
    }

    const passed = checks.every((c) => c.passed);

    return {
      passed,
      checks,
      totalExposure,
      exposureBySymbol,
      dailyPnl,
      timestamp: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Kill switch
  // -------------------------------------------------------------------------

  /**
   * Emergency kill switch: immediately pause all live deployments for a
   * workspace and cancel all pending orders.
   *
   * This is the last line of defense. When triggered:
   * 1. All ACTIVE deployments in LIVE environment are set to PAUSED
   * 2. All PENDING/SUBMITTED order intents are set to CANCELLED
   * 3. An incident record is created for audit
   *
   * Kill switch does NOT attempt to close existing positions — that is
   * a separate, more dangerous operation that requires explicit confirmation.
   */
  async killSwitch(workspaceId: string): Promise<KillSwitchResult> {
    const errors: string[] = [];
    let deploymentsPaused = 0;
    let ordersCancelled = 0;

    // Step 1: Pause all active live deployments
    try {
      const pauseResult = await db.deployment.updateMany({
        where: {
          workspaceId,
          environment: "LIVE",
          status: "ACTIVE",
        },
        data: {
          status: "PAUSED",
        },
      });
      deploymentsPaused = pauseResult.count;
    } catch (error) {
      errors.push(
        `Failed to pause deployments: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    // Also pause SHADOW_LIVE and PAPER deployments
    try {
      await db.deployment.updateMany({
        where: {
          workspaceId,
          status: "ACTIVE",
        },
        data: {
          status: "PAUSED",
        },
      });
    } catch (error) {
      errors.push(
        `Failed to pause non-live deployments: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    // Step 2: Cancel all pending/submitted order intents
    try {
      const cancelResult = await db.orderIntent.updateMany({
        where: {
          workspaceId,
          status: { in: ["PENDING", "APPROVED", "SUBMITTED"] },
        },
        data: {
          status: "CANCELLED",
        },
      });
      ordersCancelled = cancelResult.count;
    } catch (error) {
      errors.push(
        `Failed to cancel orders: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    // Step 3: Create incident record
    try {
      await db.incident.create({
        data: {
          workspaceId,
          type: "RISK_BREACH",
          status: "OPEN",
          description:
            `Kill switch activated. Paused ${deploymentsPaused} deployments, ` +
            `cancelled ${ordersCancelled} orders. ` +
            (errors.length > 0
              ? `Errors: ${errors.join("; ")}`
              : "No errors."),
        },
      });
    } catch {
      errors.push("Failed to create incident record");
    }

    return {
      workspaceId,
      deploymentsPaused,
      ordersCancelled,
      errors,
      triggeredAt: new Date(),
      success: errors.length === 0,
    };
  }

  // -------------------------------------------------------------------------
  // Daily P&L
  // -------------------------------------------------------------------------

  /**
   * Get the daily P&L for a workspace by summing all paper and live
   * ledger entries from today.
   */
  async getDailyPnL(workspaceId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all active deployments for this workspace
    const deployments = await db.deployment.findMany({
      where: {
        workspaceId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true, environment: true },
    });

    const deploymentIds = deployments.map((d) => d.id);

    if (deploymentIds.length === 0) return 0;

    // Sum P&L from paper ledger
    const paperPnl = await db.paperLedger.aggregate({
      where: {
        deploymentId: { in: deploymentIds },
        timestamp: { gte: today },
        pnl: { not: null },
      },
      _sum: { pnl: true },
    });

    // Sum P&L from live ledger
    const livePnl = await db.liveLedger.aggregate({
      where: {
        deploymentId: { in: deploymentIds },
        timestamp: { gte: today },
        pnl: { not: null },
      },
      _sum: { pnl: true },
    });

    const paperTotal = Number(paperPnl._sum.pnl ?? 0);
    const liveTotal = Number(livePnl._sum.pnl ?? 0);

    return Math.round((paperTotal + liveTotal) * 100) / 100;
  }

  // -------------------------------------------------------------------------
  // Exposure
  // -------------------------------------------------------------------------

  /**
   * Get exposure information for a workspace, optionally filtered to a
   * specific symbol.
   */
  async getExposure(
    workspaceId: string,
    symbol?: string,
  ): Promise<ExposureInfo> {
    // Get the latest position snapshots for this workspace
    const where: Record<string, unknown> = { workspaceId };
    if (symbol) {
      where.symbol = symbol;
    }

    // Get the most recent snapshot timestamp
    const latestSnapshot = await db.positionSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });

    if (!latestSnapshot) {
      return {
        workspaceId,
        totalExposure: 0,
        netExposure: 0,
        grossExposure: 0,
        bySymbol: [],
      };
    }

    const positions = await db.positionSnapshot.findMany({
      where: {
        ...where,
        snapshotAt: latestSnapshot.snapshotAt,
      },
    });

    let longExposure = 0;
    let shortExposure = 0;
    const bySymbol: ExposureInfo["bySymbol"] = [];

    for (const pos of positions) {
      const value = pos.quantity * Number(pos.lastPrice ?? pos.averagePrice);
      const absValue = Math.abs(value);

      if (pos.quantity > 0) {
        longExposure += absValue;
      } else if (pos.quantity < 0) {
        shortExposure += absValue;
      }

      bySymbol.push({
        symbol: pos.symbol,
        exchange: pos.exchange,
        quantity: pos.quantity,
        value,
        weight: 0, // Will be computed below
      });
    }

    const grossExposure = longExposure + shortExposure;
    const netExposure = longExposure - shortExposure;

    // Compute weights
    for (const entry of bySymbol) {
      entry.weight =
        grossExposure > 0
          ? Math.round((Math.abs(entry.value) / grossExposure) * 10000) /
            10000
          : 0;
    }

    // Sort by absolute weight descending
    bySymbol.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    return {
      workspaceId,
      totalExposure: Math.round(grossExposure * 100) / 100,
      netExposure: Math.round(netExposure * 100) / 100,
      grossExposure: Math.round(grossExposure * 100) / 100,
      bySymbol,
    };
  }

  // -------------------------------------------------------------------------
  // Individual policy checks (private)
  // -------------------------------------------------------------------------

  private async checkMaxOrderSize(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): Promise<RiskCheckResult> {
    // Threshold represents max order value in INR
    const estimatedValue =
      intent.quantity * (intent.price ?? 0);

    // If no price (market order), we still check quantity against threshold
    // assuming threshold is in value terms. For quantity-based checks,
    // the policy threshold would be set as number of shares.
    const currentValue =
      intent.price !== undefined
        ? estimatedValue
        : intent.quantity;

    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: currentValue <= policy.threshold,
      currentValue,
      threshold: policy.threshold,
      message:
        currentValue > policy.threshold
          ? `Order size ${currentValue} exceeds max order size limit ${policy.threshold}`
          : `Order size ${currentValue} within limit`,
    };
  }

  private async checkMaxCapital(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): Promise<RiskCheckResult> {
    // Get total current exposure for the workspace
    const exposure = await this.getExposure(intent.workspaceId);
    const orderValue =
      intent.quantity * (intent.price ?? 0);
    const projectedExposure = exposure.grossExposure + orderValue;

    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: projectedExposure <= policy.threshold,
      currentValue: projectedExposure,
      threshold: policy.threshold,
      message:
        projectedExposure > policy.threshold
          ? `Projected capital exposure ${projectedExposure} would exceed limit ${policy.threshold}`
          : `Projected capital exposure ${projectedExposure} within limit`,
    };
  }

  private async checkMaxDailyLoss(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): Promise<RiskCheckResult> {
    const dailyPnl = await this.getDailyPnL(intent.workspaceId);

    // If already in loss territory beyond the threshold, block new orders
    const lossExceeded = dailyPnl < -policy.threshold;

    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: !lossExceeded,
      currentValue: dailyPnl,
      threshold: policy.threshold,
      message: lossExceeded
        ? `Daily P&L ${dailyPnl} has exceeded max daily loss limit -${policy.threshold}. New orders blocked.`
        : `Daily P&L ${dailyPnl} within max daily loss limit`,
    };
  }

  private async checkMaxExposure(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): Promise<RiskCheckResult> {
    const exposure = await this.getExposure(
      intent.workspaceId,
      intent.symbol,
    );

    // Find current exposure for this specific symbol
    const symbolExposure =
      exposure.bySymbol.find((s) => s.symbol === intent.symbol)?.value ?? 0;
    const orderValue =
      intent.quantity * (intent.price ?? 0);
    const projectedExposure = Math.abs(symbolExposure) + orderValue;

    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: projectedExposure <= policy.threshold,
      currentValue: projectedExposure,
      threshold: policy.threshold,
      message:
        projectedExposure > policy.threshold
          ? `Symbol ${intent.symbol} projected exposure ${projectedExposure} would exceed limit ${policy.threshold}`
          : `Symbol ${intent.symbol} exposure ${projectedExposure} within limit`,
    };
  }

  private async checkMaxConcurrent(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): Promise<RiskCheckResult> {
    // Count open positions for this workspace
    const latestSnapshot = await db.positionSnapshot.findFirst({
      where: { workspaceId: intent.workspaceId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });

    let openPositions = 0;
    if (latestSnapshot) {
      openPositions = await db.positionSnapshot.count({
        where: {
          workspaceId: intent.workspaceId,
          snapshotAt: latestSnapshot.snapshotAt,
          quantity: { not: 0 },
        },
      });
    }

    // If this is a new position (not adding to existing), count it
    const isNewPosition = !latestSnapshot || openPositions === 0;
    const projectedPositions = isNewPosition
      ? openPositions + 1
      : openPositions;

    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: projectedPositions <= policy.threshold,
      currentValue: projectedPositions,
      threshold: policy.threshold,
      message:
        projectedPositions > policy.threshold
          ? `Concurrent positions ${projectedPositions} would exceed limit ${policy.threshold}`
          : `Concurrent positions ${projectedPositions} within limit`,
    };
  }

  private checkMaxSlippage(
    intent: OrderIntent,
    policy: RiskPolicy,
  ): RiskCheckResult {
    // For MARKET orders, estimate slippage risk based on order size.
    // Threshold is in basis points.
    if (intent.orderType === "MARKET") {
      // Large market orders have higher slippage risk
      // Heuristic: orders > 5000 shares are considered high-slippage risk
      const estimatedSlippageBps =
        intent.quantity > 5000
          ? 10 + (intent.quantity / 5000) * 2
          : 5;

      return {
        policyId: policy.id,
        policyName: policy.name,
        policyType: policy.type,
        passed: estimatedSlippageBps <= policy.threshold,
        currentValue: estimatedSlippageBps,
        threshold: policy.threshold,
        message:
          estimatedSlippageBps > policy.threshold
            ? `Estimated slippage ${estimatedSlippageBps} bps exceeds limit ${policy.threshold} bps for MARKET order of ${intent.quantity} shares`
            : `Estimated slippage ${estimatedSlippageBps} bps within limit`,
      };
    }

    // LIMIT orders have no slippage risk by definition
    return {
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.type,
      passed: true,
      currentValue: 0,
      threshold: policy.threshold,
      message: "LIMIT order — no slippage risk",
    };
  }
}
