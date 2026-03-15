import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-deployment divergence analysis. */
export interface DeploymentDivergence {
  deploymentId: string;
  workspaceId: string;
  environment: string;
  entryTimeDelta: number | null;
  priceDelta: number | null;
  fillRateDelta: number | null;
  positionDelta: number | null;
  pnlDelta: number | null;
  divergenceScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reportCreated: boolean;
  incidentCreated: boolean;
  capitalRestricted: boolean;
  familySeeded: boolean;
}

/** Summary of the divergence check run. */
export interface DivergenceCheckResult {
  deployments: DeploymentDivergence[];
  totalChecked: number;
  divergent: number;
  reportsCreated: number;
  incidentsCreated: number;
  capitalRestrictions: number;
  familiesSeeded: number;
  checkedAt: Date;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Divergence score above which a report is created. */
const REPORT_THRESHOLD = 0.1;

/** Divergence score above which an incident is created (CRITICAL). */
const INCIDENT_THRESHOLD = 0.5;

/** Divergence score above which capital is restricted. */
const CAPITAL_RESTRICT_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Classifies a divergence score into a severity level.
 */
function classifySeverity(
  score: number,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 0.7) return "CRITICAL";
  if (score >= 0.5) return "HIGH";
  if (score >= 0.25) return "MEDIUM";
  return "LOW";
}

/**
 * Computes divergence between paper ledger and live ledger entries for
 * a deployment.
 *
 * Compares the most recent trades on each side and computes deltas
 * for entry time, price, fill rate, position, and P&L.
 */
async function computeDivergence(deploymentId: string): Promise<{
  entryTimeDelta: number | null;
  priceDelta: number | null;
  fillRateDelta: number | null;
  positionDelta: number | null;
  pnlDelta: number | null;
  divergenceScore: number;
}> {
  // Fetch recent paper trades
  const paperTrades = await db.paperLedger.findMany({
    where: { deploymentId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  // Fetch recent live trades
  const liveTrades = await db.liveLedger.findMany({
    where: { deploymentId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  // If either side has no trades, we can't compute divergence
  if (paperTrades.length === 0 || liveTrades.length === 0) {
    return {
      entryTimeDelta: null,
      priceDelta: null,
      fillRateDelta: null,
      positionDelta: null,
      pnlDelta: null,
      divergenceScore: 0,
    };
  }

  // Compare matched trades by symbol and rough timestamp proximity
  let totalTimeDelta = 0;
  let totalPriceDelta = 0;
  let matchedCount = 0;

  for (const paperTrade of paperTrades) {
    // Find corresponding live trade (same symbol, closest in time)
    const match = liveTrades.find(
      (lt) =>
        lt.symbol === paperTrade.symbol &&
        Math.abs(lt.timestamp.getTime() - paperTrade.timestamp.getTime()) <
          60 * 60 * 1000, // within 1 hour
    );

    if (match) {
      const timeDeltaSeconds = Math.abs(
        match.timestamp.getTime() - paperTrade.timestamp.getTime(),
      ) / 1000;
      totalTimeDelta += timeDeltaSeconds;

      const paperPrice = Number(paperTrade.price);
      const livePrice = Number(match.price);
      if (paperPrice > 0) {
        totalPriceDelta += Math.abs(livePrice - paperPrice) / paperPrice;
      }

      matchedCount++;
    }
  }

  // Fill rate: percentage of paper trades that found a live match
  const fillRateDelta =
    paperTrades.length > 0
      ? 1 - matchedCount / paperTrades.length
      : null;

  // Average entry time delta (in seconds)
  const entryTimeDelta =
    matchedCount > 0 ? totalTimeDelta / matchedCount : null;

  // Average price delta (as a fraction)
  const priceDelta =
    matchedCount > 0 ? totalPriceDelta / matchedCount : null;

  // Position delta: net quantity difference
  const paperNetQty = paperTrades.reduce((sum, t) => {
    const sign = t.action === "BUY" ? 1 : t.action === "SELL" ? -1 : 0;
    return sum + sign * t.quantity;
  }, 0);

  const liveNetQty = liveTrades.reduce((sum, t) => {
    const sign = t.action === "BUY" ? 1 : t.action === "SELL" ? -1 : 0;
    return sum + sign * t.quantity;
  }, 0);

  const positionDelta =
    paperNetQty !== 0
      ? Math.abs(liveNetQty - paperNetQty) / Math.abs(paperNetQty)
      : liveNetQty !== 0
        ? 1
        : null;

  // P&L delta
  const paperPnl = paperTrades.reduce(
    (sum, t) => sum + Number(t.pnl ?? 0),
    0,
  );
  const livePnl = liveTrades.reduce(
    (sum, t) => sum + Number(t.pnl ?? 0),
    0,
  );
  const pnlDelta =
    Math.abs(paperPnl) > 0
      ? Math.abs(livePnl - paperPnl) / Math.abs(paperPnl)
      : livePnl !== 0
        ? 1
        : null;

  // Composite divergence score (weighted average of available metrics)
  const components: number[] = [];
  if (entryTimeDelta !== null)
    components.push(Math.min(entryTimeDelta / 300, 1)); // normalize to 5 min
  if (priceDelta !== null) components.push(Math.min(priceDelta * 10, 1)); // 10% = 1.0
  if (fillRateDelta !== null) components.push(fillRateDelta);
  if (positionDelta !== null) components.push(Math.min(positionDelta, 1));
  if (pnlDelta !== null) components.push(Math.min(pnlDelta, 1));

  const divergenceScore =
    components.length > 0
      ? components.reduce((a, b) => a + b, 0) / components.length
      : 0;

  return {
    entryTimeDelta,
    priceDelta,
    fillRateDelta,
    positionDelta,
    pnlDelta,
    divergenceScore,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Live divergence checker.
 *
 * For every active deployment with environment SHADOW_LIVE or LIVE,
 * compares expected (paper) vs actual (live) trade execution along five
 * axes: entry time, price, fill rate, position, and P&L.
 *
 * Depending on the computed divergence score:
 *
 *   - Score > 0.1:  Creates a DivergenceReport.
 *   - Score > 0.5:  Creates an Incident (CRITICAL).
 *   - Score > 0.7:  Restricts capital allocation on the deployment.
 *   - If the divergence has a clear, actionable explanation, seeds a new
 *     testing family to investigate the root cause.
 *
 * This job should run periodically during market hours (e.g. every 5 min).
 *
 * @returns Summary of all deployment checks.
 */
export async function checkDivergence(): Promise<DivergenceCheckResult> {
  const startTime = Date.now();
  const checkedAt = new Date();

  // Fetch all active deployments in SHADOW_LIVE or LIVE
  const deployments = await db.deployment.findMany({
    where: {
      status: { in: ["ACTIVE", "APPROVED"] },
      environment: { in: ["SHADOW_LIVE", "LIVE"] },
    },
    include: {
      strategyVersion: {
        select: {
          id: true,
          version: true,
          family: {
            select: { id: true, slug: true, name: true, workspaceId: true },
          },
        },
      },
    },
  });

  const results: DeploymentDivergence[] = [];
  let reportsCreated = 0;
  let incidentsCreated = 0;
  let capitalRestrictions = 0;
  let familiesSeeded = 0;

  for (const deployment of deployments) {
    const workspaceId = deployment.workspaceId;

    // Compute divergence metrics
    const divergence = await computeDivergence(deployment.id);

    let reportCreated = false;
    let incidentCreated = false;
    let capitalRestricted = false;
    let familySeeded = false;

    const severity = classifySeverity(divergence.divergenceScore);

    // Create DivergenceReport if score exceeds threshold
    if (divergence.divergenceScore >= REPORT_THRESHOLD) {
      const report = await db.divergenceReport.create({
        data: {
          deploymentId: deployment.id,
          workspaceId,
          entryTimeDelta: divergence.entryTimeDelta,
          priceDelta: divergence.priceDelta,
          fillRateDelta: divergence.fillRateDelta,
          positionDelta: divergence.positionDelta,
          pnlDelta: divergence.pnlDelta,
          divergenceScore: divergence.divergenceScore,
          severity,
        },
      });
      reportCreated = true;
      reportsCreated++;

      // Create Incident if CRITICAL
      if (divergence.divergenceScore >= INCIDENT_THRESHOLD) {
        await db.incident.create({
          data: {
            workspaceId,
            deploymentId: deployment.id,
            divergenceReportId: report.id,
            type: "DIVERGENCE",
            status: "OPEN",
            description:
              `${severity} divergence detected for deployment ${deployment.id} ` +
              `(${deployment.environment}). Score: ${divergence.divergenceScore.toFixed(3)}. ` +
              `Price delta: ${divergence.priceDelta?.toFixed(4) ?? "N/A"}, ` +
              `Fill rate delta: ${divergence.fillRateDelta?.toFixed(4) ?? "N/A"}, ` +
              `P&L delta: ${divergence.pnlDelta?.toFixed(4) ?? "N/A"}.`,
          },
        });
        incidentCreated = true;
        incidentsCreated++;
      }

      // Restrict capital if threshold breached
      if (divergence.divergenceScore >= CAPITAL_RESTRICT_THRESHOLD) {
        await db.deployment.update({
          where: { id: deployment.id },
          data: {
            status: "PAUSED",
          },
        });
        capitalRestricted = true;
        capitalRestrictions++;
      }

      // Seed new testing family if divergence explanation is clear
      // (heuristic: if fill rate or price delta is the dominant cause)
      if (
        severity === "CRITICAL" &&
        divergence.priceDelta !== null &&
        divergence.priceDelta > 0.02
      ) {
        const family = deployment.strategyVersion.family;
        try {
          await db.strategyFamily.create({
            data: {
              workspaceId,
              slug: `${family.slug}-divergence-investigation-${Date.now()}`,
              name: `${family.name} - Divergence Investigation`,
              description:
                `Auto-seeded from divergence on deployment ${deployment.id}. ` +
                `Score: ${divergence.divergenceScore.toFixed(3)}. ` +
                `Investigating price delta (${divergence.priceDelta.toFixed(4)}) ` +
                `and execution quality.`,
              objective:
                "Investigate and resolve execution divergence between paper and live trading.",
            },
          });
          familySeeded = true;
          familiesSeeded++;
        } catch (err) {
          // Slug conflict is possible; log and continue
          console.error(
            `[divergence-check] Failed to seed investigation family:`,
            err,
          );
        }
      }
    }

    results.push({
      deploymentId: deployment.id,
      workspaceId,
      environment: deployment.environment,
      entryTimeDelta: divergence.entryTimeDelta,
      priceDelta: divergence.priceDelta,
      fillRateDelta: divergence.fillRateDelta,
      positionDelta: divergence.positionDelta,
      pnlDelta: divergence.pnlDelta,
      divergenceScore: divergence.divergenceScore,
      severity,
      reportCreated,
      incidentCreated,
      capitalRestricted,
      familySeeded,
    });
  }

  const divergent = results.filter((r) => r.reportCreated).length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[divergence-check] checked=${results.length} divergent=${divergent} reports=${reportsCreated} incidents=${incidentsCreated} capitalRestrictions=${capitalRestrictions} familiesSeeded=${familiesSeeded} duration=${durationMs}ms`,
  );

  return {
    deployments: results,
    totalChecked: results.length,
    divergent,
    reportsCreated,
    incidentsCreated,
    capitalRestrictions,
    familiesSeeded,
    checkedAt,
    durationMs,
  };
}
