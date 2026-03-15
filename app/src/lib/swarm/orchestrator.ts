// ---------------------------------------------------------------------------
// Swarm Engine – Orchestrator
// ---------------------------------------------------------------------------
// The SwarmOrchestrator is the central coordinator for a swarm run.  It owns
// the full lifecycle: launch, spawn children, monitor heartbeats, rank by
// composite score, retire weak performers, and promote winners.
//
// The orchestrator does NOT execute strategies itself — it delegates to
// Modal sandboxes via the run system and collects results through the
// existing event/metrics pipeline.
// ---------------------------------------------------------------------------

import db from "@/lib/db";
import { computeScore } from "./scoring";
import { getTemplate } from "./templates";
import type {
  SwarmConfig,
  SwarmSession,
  ChildConfig,
  SwarmChildSession,
  HealthReport,
  RankedChild,
  PromotionResult,
  StrategyMetrics,
  ScoreWeights,
} from "./types";
import { DEFAULT_SCORE_WEIGHTS } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Children that haven't sent a heartbeat within this window are stale. */
const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum failure rate before a swarm is considered critical. */
const CRITICAL_FAILURE_RATE = 0.5;

/** Failure rate threshold for "degraded" status. */
const DEGRADED_FAILURE_RATE = 0.2;

// ---------------------------------------------------------------------------
// SwarmOrchestrator
// ---------------------------------------------------------------------------

export class SwarmOrchestrator {
  // -----------------------------------------------------------------------
  // launch
  // -----------------------------------------------------------------------

  /**
   * Initialise a new swarm session:
   * 1. Validate the template and family exist.
   * 2. Reserve credits from the workspace's TESTING account.
   * 3. Create the Swarm record in PENDING state.
   * 4. Transition to RUNNING.
   *
   * Returns the hydrated `SwarmSession`.
   */
  async launch(config: SwarmConfig): Promise<SwarmSession> {
    // Validate template
    const template = getTemplate(config.templateId);
    if (!template) {
      // Fall back to DB lookup (custom templates stored there)
      const dbTemplate = await db.swarmTemplate.findUnique({
        where: { id: config.templateId },
      });
      if (!dbTemplate) {
        throw new Error(`Unknown swarm template: ${config.templateId}`);
      }
    }

    // Validate family belongs to workspace
    const family = await db.strategyFamily.findFirst({
      where: { id: config.familyId, workspaceId: config.workspaceId },
    });
    if (!family) {
      throw new Error(
        `Strategy family ${config.familyId} not found in workspace ${config.workspaceId}`,
      );
    }

    const maxConcurrency =
      config.maxConcurrency ??
      template?.defaultConcurrency ??
      5;

    // Create swarm + credit reservation in a single transaction
    const swarm = await db.$transaction(async (tx) => {
      // Reserve credits
      let reservationId: string | null = null;
      if (config.creditCeiling > 0) {
        const account = await tx.creditAccount.findFirst({
          where: { workspaceId: config.workspaceId, bucket: "TESTING" },
        });

        if (!account) {
          throw new Error(
            `No TESTING credit account for workspace ${config.workspaceId}`,
          );
        }

        const balance = Number(account.balance);
        if (balance < config.creditCeiling) {
          throw new Error(
            `Insufficient credits. Available: ${balance}, Requested: ${config.creditCeiling}`,
          );
        }

        const reservation = await tx.creditReservation.create({
          data: {
            accountId: account.id,
            amount: config.creditCeiling,
            status: "PENDING",
            swarmId: null, // will be linked after swarm creation
          },
        });

        await tx.creditAccount.update({
          where: { id: account.id },
          data: {
            balance: { decrement: config.creditCeiling },
            reservedBalance: { increment: config.creditCeiling },
          },
        });

        reservationId = reservation.id;
      }

      // Create the swarm record
      const record = await tx.swarm.create({
        data: {
          workspaceId: config.workspaceId,
          templateId: config.templateId,
          familyId: config.familyId,
          name: config.name,
          objective: config.objective ?? null,
          status: "RUNNING",
          maxConcurrency,
          activeChildCount: 0,
          failureRate: 0,
          creditReservationId: reservationId,
          currentBestCandidateId: null,
        },
      });

      // Link reservation to swarm now that we have the ID
      if (reservationId) {
        await tx.creditReservation.update({
          where: { id: reservationId },
          data: { swarmId: record.id },
        });
      }

      return record;
    });

    return toSwarmSession(swarm);
  }

  // -----------------------------------------------------------------------
  // spawnChild
  // -----------------------------------------------------------------------

  /**
   * Create a new child sandbox within a running swarm.
   *
   * 1. Verify the swarm is RUNNING and under its concurrency limit.
   * 2. Create a Run record for the child's work.
   * 3. Create a SwarmChild record linked to the run.
   * 4. Increment the swarm's `activeChildCount`.
   */
  async spawnChild(
    swarmId: string,
    hypothesis: string,
    config: ChildConfig,
  ): Promise<SwarmChildSession> {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);
    if (swarm.status !== "RUNNING") {
      throw new Error(
        `Cannot spawn child: swarm is ${swarm.status}, expected RUNNING`,
      );
    }
    if (swarm.activeChildCount >= swarm.maxConcurrency) {
      throw new Error(
        `Swarm ${swarmId} at concurrency limit (${swarm.maxConcurrency})`,
      );
    }

    const result = await db.$transaction(async (tx) => {
      // Create a run for this child
      const run = await tx.run.create({
        data: {
          experimentId: config.experimentId,
          workspaceId: swarm.workspaceId,
          environment: mapEnvironment(config.environment ?? "RESEARCH"),
          status: "PENDING",
          hypothesis,
          config: config.runConfig ?? {},
        },
      });

      // Create the child record
      const child = await tx.swarmChild.create({
        data: {
          swarmId,
          runId: run.id,
          status: "PENDING",
          hypothesis,
        },
      });

      // Increment active child count
      await tx.swarm.update({
        where: { id: swarmId },
        data: { activeChildCount: { increment: 1 } },
      });

      return child;
    });

    return toChildSession(result);
  }

  // -----------------------------------------------------------------------
  // checkHeartbeats
  // -----------------------------------------------------------------------

  /**
   * Check liveness of all active children in a swarm.
   * A child is "stale" if its last HEARTBEAT event is older than the
   * threshold, and "failed" if its status is FAILED.
   */
  async checkHeartbeats(swarmId: string): Promise<HealthReport> {
    const children = await db.swarmChild.findMany({
      where: { swarmId },
      include: {
        run: {
          include: {
            events: {
              where: { type: "HEARTBEAT" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const now = Date.now();
    const staleChildren: string[] = [];
    const failedChildren: string[] = [];
    let healthy = 0;

    for (const child of children) {
      if (child.status === "FAILED") {
        failedChildren.push(child.id);
        continue;
      }

      if (child.status === "COMPLETED") {
        healthy++;
        continue;
      }

      // PENDING or RUNNING — check heartbeat freshness
      const lastHeartbeat = child.run?.events[0]?.createdAt;
      if (lastHeartbeat && now - lastHeartbeat.getTime() > HEARTBEAT_STALE_MS) {
        staleChildren.push(child.id);
      } else if (child.status === "RUNNING") {
        healthy++;
      }
    }

    const totalChildren = children.length;
    const unhealthy = staleChildren.length + failedChildren.length;
    const failureRate = totalChildren > 0 ? unhealthy / totalChildren : 0;

    // Update swarm failure rate
    await db.swarm.update({
      where: { id: swarmId },
      data: { failureRate },
    });

    let status: HealthReport["status"];
    if (failureRate >= CRITICAL_FAILURE_RATE) {
      status = "critical";
    } else if (failureRate >= DEGRADED_FAILURE_RATE) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      swarmId,
      totalChildren,
      healthy,
      unhealthy,
      staleChildren,
      failedChildren,
      status,
      checkedAt: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // rankChildren
  // -----------------------------------------------------------------------

  /**
   * Rank all children of a swarm by composite score (descending).
   * Only children with metrics are included in the ranking.
   */
  async rankChildren(
    swarmId: string,
    weights?: ScoreWeights,
  ): Promise<RankedChild[]> {
    const children = await db.swarmChild.findMany({
      where: { swarmId, metrics: { not: null } },
    });

    const w = weights ?? DEFAULT_SCORE_WEIGHTS;

    const scored = children
      .map((child) => {
        const raw = child.metrics as Record<string, unknown> | null;
        if (!raw) return null;

        const metrics = extractMetrics(raw);
        const score = computeScore(metrics, w);

        return {
          childId: child.id,
          runId: child.runId,
          hypothesis: child.hypothesis,
          score,
          metrics,
          status: child.status,
        };
      })
      .filter(Boolean) as Omit<RankedChild, "rank">[];

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.map((s, idx) => ({ ...s, rank: idx + 1 }));
  }

  // -----------------------------------------------------------------------
  // retireWeakest
  // -----------------------------------------------------------------------

  /**
   * Stop the N worst-performing children in a swarm.
   * Marks them as COMPLETED (graceful retirement), stops their runs,
   * and decrements the active child count.
   */
  async retireWeakest(swarmId: string, count: number): Promise<void> {
    const ranked = await this.rankChildren(swarmId);
    const activeRanked = ranked.filter(
      (r) => r.status === "RUNNING" || r.status === "PENDING",
    );

    // Take the worst `count` from the tail
    const toRetire = activeRanked.slice(-count);
    if (toRetire.length === 0) return;

    await db.$transaction(async (tx) => {
      for (const child of toRetire) {
        // Mark child as completed
        await tx.swarmChild.update({
          where: { id: child.childId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            score: child.score,
          },
        });

        // Stop the associated run
        if (child.runId) {
          await tx.run.update({
            where: { id: child.runId },
            data: { status: "STOPPED", completedAt: new Date() },
          });
        }
      }

      // Decrement active child count
      await tx.swarm.update({
        where: { id: swarmId },
        data: { activeChildCount: { decrement: toRetire.length } },
      });
    });
  }

  // -----------------------------------------------------------------------
  // promoteWinner
  // -----------------------------------------------------------------------

  /**
   * Promote the highest-scoring child to the next lifecycle stage.
   * Creates a new StrategyVersion from the winning candidate's metrics
   * and marks it as the swarm's best.
   */
  async promoteWinner(swarmId: string): Promise<PromotionResult> {
    const ranked = await this.rankChildren(swarmId);
    if (ranked.length === 0) {
      throw new Error(`Swarm ${swarmId} has no ranked children to promote`);
    }

    const winner = ranked[0]!;
    const swarm = await db.swarm.findUnique({
      where: { id: swarmId },
      include: { family: true },
    });
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    // Determine promotion target based on current swarm template
    const template = getTemplate(swarm.templateId);
    let promotedTo: PromotionResult["promotedTo"];
    if (template?.evaluationStrategy === "shadow_live_comparison") {
      promotedTo = "SHADOW_LIVE";
    } else if (template?.evaluationStrategy === "replay_perturbation") {
      promotedTo = "PAPER";
    } else {
      promotedTo = "TESTING";
    }

    // Find the next version number for this family
    const latestVersion = await db.strategyVersion.findFirst({
      where: { familyId: swarm.familyId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const strategyVersion = await db.$transaction(async (tx) => {
      // Create strategy version
      const sv = await tx.strategyVersion.create({
        data: {
          familyId: swarm.familyId,
          version: nextVersion,
          codeSnapshot: winner.hypothesis ?? "",
          configSnapshot: winner.metrics as unknown as Record<string, unknown>,
          metrics: {
            ...(winner.metrics as unknown as Record<string, unknown>),
            compositeScore: winner.score,
            swarmId,
            childId: winner.childId,
          },
          status: promotedTo,
        },
      });

      // Update swarm's best candidate
      await tx.swarm.update({
        where: { id: swarmId },
        data: { currentBestCandidateId: winner.childId },
      });

      return sv;
    });

    return {
      childId: winner.childId,
      strategyVersionId: strategyVersion.id,
      promotedTo,
      score: winner.score,
    };
  }

  // -----------------------------------------------------------------------
  // pause / resume
  // -----------------------------------------------------------------------

  /**
   * Pause a running swarm. Children already in-flight continue to completion
   * but no new children will be spawned.
   */
  async pause(swarmId: string): Promise<void> {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);
    if (swarm.status !== "RUNNING") {
      throw new Error(
        `Cannot pause swarm with status ${swarm.status}; must be RUNNING`,
      );
    }

    await db.swarm.update({
      where: { id: swarmId },
      data: { status: "PAUSED" },
    });
  }

  /**
   * Resume a paused swarm.
   */
  async resume(swarmId: string): Promise<void> {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);
    if (swarm.status !== "PAUSED") {
      throw new Error(
        `Cannot resume swarm with status ${swarm.status}; must be PAUSED`,
      );
    }

    await db.swarm.update({
      where: { id: swarmId },
      data: { status: "RUNNING" },
    });
  }

  // -----------------------------------------------------------------------
  // shrink
  // -----------------------------------------------------------------------

  /**
   * Reduce the swarm's concurrency limit.  If current active children
   * exceed the new limit, the weakest are retired to bring the count
   * within bounds.
   */
  async shrink(swarmId: string, maxConcurrency: number): Promise<void> {
    if (maxConcurrency < 1) {
      throw new Error("maxConcurrency must be at least 1");
    }

    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm ${swarmId} not found`);

    // Update the concurrency limit
    await db.swarm.update({
      where: { id: swarmId },
      data: { maxConcurrency },
    });

    // If we're over the new limit, retire the excess
    if (swarm.activeChildCount > maxConcurrency) {
      const excess = swarm.activeChildCount - maxConcurrency;
      await this.retireWeakest(swarmId, excess);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSwarmSession(record: {
  id: string;
  workspaceId: string;
  familyId: string;
  templateId: string;
  name: string;
  objective: string | null;
  status: string;
  maxConcurrency: number;
  activeChildCount: number;
  creditReservationId: string | null;
  currentBestCandidateId: string | null;
  failureRate: number;
  createdAt: Date;
  updatedAt: Date;
}): SwarmSession {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    familyId: record.familyId,
    templateId: record.templateId,
    name: record.name,
    objective: record.objective,
    status: record.status as SwarmSession["status"],
    maxConcurrency: record.maxConcurrency,
    activeChildCount: record.activeChildCount,
    creditReservationId: record.creditReservationId,
    currentBestCandidateId: record.currentBestCandidateId,
    failureRate: record.failureRate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toChildSession(record: {
  id: string;
  swarmId: string;
  runId: string | null;
  status: string;
  hypothesis: string | null;
  score: number | null;
  metrics: unknown;
  createdAt: Date;
  completedAt: Date | null;
}): SwarmChildSession {
  return {
    id: record.id,
    swarmId: record.swarmId,
    runId: record.runId,
    status: record.status as SwarmChildSession["status"],
    hypothesis: record.hypothesis,
    score: record.score,
    metrics: record.metrics as StrategyMetrics | null,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  };
}

function mapEnvironment(
  env: "RESEARCH" | "PAPER" | "SHADOW_LIVE" | "LIVE",
): "RESEARCH" | "PAPER" | "SHADOW_LIVE" | "LIVE" {
  return env;
}

function extractMetrics(raw: Record<string, unknown>): StrategyMetrics {
  return {
    totalReturn: (raw.totalReturn as number) ?? 0,
    alpha: (raw.alpha as number) ?? 0,
    sharpe: (raw.sharpe as number) ?? 0,
    sortino: (raw.sortino as number) ?? 0,
    maxDrawdown: (raw.maxDrawdown as number) ?? 0,
    winRate: (raw.winRate as number) ?? 0,
    profitFactor: (raw.profitFactor as number) ?? 1,
    tradeCount: (raw.tradeCount as number) ?? 0,
    inSampleSharpe: raw.inSampleSharpe as number | undefined,
    outOfSampleSharpe: raw.outOfSampleSharpe as number | undefined,
    backtestDays: raw.backtestDays as number | undefined,
    paperDays: raw.paperDays as number | undefined,
    parameterSensitivity: raw.parameterSensitivity as number | undefined,
  };
}
