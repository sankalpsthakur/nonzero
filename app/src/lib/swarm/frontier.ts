// ---------------------------------------------------------------------------
// Swarm Engine – Frontier Manager
// ---------------------------------------------------------------------------
// Manages the Pareto frontier of strategy candidates within a family.
// The frontier is the set of top-K candidates that represent the current
// best-known strategies.  Autoresearch (Lane A) generates mutations from
// the frontier; hyperspace (Lane B) evaluates them; results feed back here.
// ---------------------------------------------------------------------------

import db from "@/lib/db";
import { computeScore } from "./scoring";
import type {
  StrategyCandidate,
  StrategyMetrics,
  EvaluationResult,
  FrontierDelta,
  MutationPlan,
  MutationType,
  ScoreWeights,
  DivergenceReport,
} from "./types";
import { DEFAULT_SCORE_WEIGHTS } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default frontier size (top-K candidates to maintain). */
const DEFAULT_FRONTIER_SIZE = 10;

/** Mutation types we draw from when generating plans. */
const MUTATION_POOL: MutationType[] = [
  "prompt_tweak",
  "parameter_sweep",
  "regime_shift",
  "universe_change",
  "risk_profile_change",
  "signal_combination",
  "timeframe_change",
  "crossover",
];

// ---------------------------------------------------------------------------
// FrontierManager
// ---------------------------------------------------------------------------

export class FrontierManager {
  private readonly scoreWeights: ScoreWeights;
  private readonly frontierSize: number;

  constructor(opts?: { scoreWeights?: ScoreWeights; frontierSize?: number }) {
    this.scoreWeights = opts?.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
    this.frontierSize = opts?.frontierSize ?? DEFAULT_FRONTIER_SIZE;
  }

  // -----------------------------------------------------------------------
  // addCandidate
  // -----------------------------------------------------------------------

  /**
   * Add a new strategy candidate to a family's frontier pool.
   * The composite score is computed on ingestion so it is always consistent
   * with the current weight configuration.
   */
  async addCandidate(
    familyId: string,
    candidate: StrategyCandidate,
  ): Promise<void> {
    const score = computeScore(candidate.metrics, this.scoreWeights);

    await db.strategyVersion.create({
      data: {
        familyId,
        version: candidate.generation,
        codeSnapshot: candidate.codeSnapshotId ?? "",
        configSnapshot: candidate.metrics as unknown as Record<string, unknown>,
        metrics: {
          ...candidate.metrics,
          compositeScore: score,
          candidateId: candidate.id,
          parentId: candidate.parentId,
          mutationDescription: candidate.mutationDescription,
        },
        status: "TESTING",
      },
    });
  }

  // -----------------------------------------------------------------------
  // getFrontier
  // -----------------------------------------------------------------------

  /**
   * Retrieve the top-K candidates from the frontier for a given family.
   * Candidates are ranked by composite score descending.
   */
  async getFrontier(
    familyId: string,
    topK?: number,
  ): Promise<StrategyCandidate[]> {
    const k = topK ?? this.frontierSize;

    const versions = await db.strategyVersion.findMany({
      where: {
        familyId,
        status: { in: ["TESTING", "PAPER", "SHADOW_LIVE", "LIVE"] },
        metrics: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: k * 3, // over-fetch to re-rank with current weights
    });

    // Re-score with current weights and sort
    const candidates: StrategyCandidate[] = versions
      .filter((v) => v.metrics != null)
      .map((v) => {
        const raw = v.metrics as Record<string, unknown>;
        const metrics = extractMetrics(raw);
        return {
          id: (raw.candidateId as string) ?? v.id,
          familyId: v.familyId,
          generation: v.version,
          codeSnapshotId: v.codeSnapshot || undefined,
          parentId: (raw.parentId as string) ?? null,
          mutationDescription: (raw.mutationDescription as string) ?? null,
          metrics,
          compositeScore: computeScore(metrics, this.scoreWeights),
          createdAt: v.createdAt,
        };
      });

    candidates.sort((a, b) => b.compositeScore - a.compositeScore);

    return candidates.slice(0, k);
  }

  // -----------------------------------------------------------------------
  // updateFrontier
  // -----------------------------------------------------------------------

  /**
   * Ingest a batch of evaluation results and recompute the frontier.
   * Returns a delta describing what changed: which candidates were promoted
   * into the frontier, which fell out, and whether the best changed.
   */
  async updateFrontier(
    familyId: string,
    results: EvaluationResult[],
  ): Promise<FrontierDelta> {
    // Fetch existing frontier before the update
    const previousFrontier = await this.getFrontier(familyId);
    const previousIds = new Set(previousFrontier.map((c) => c.id));
    const previousBestId = previousFrontier[0]?.id ?? null;

    // Persist successful results
    let evaluatedCount = 0;
    for (const result of results) {
      if (!result.success) continue;
      evaluatedCount++;

      const score = computeScore(result.metrics, this.scoreWeights);

      // Upsert metrics into the corresponding strategy version
      // We look up by candidateId stored in metrics JSON
      const versions = await db.strategyVersion.findMany({
        where: {
          familyId,
          metrics: { path: ["candidateId"], equals: result.candidateId },
        },
        take: 1,
      });

      if (versions.length > 0) {
        const version = versions[0]!;
        const existingMetrics = (version.metrics as Record<string, unknown>) ?? {};
        await db.strategyVersion.update({
          where: { id: version.id },
          data: {
            metrics: {
              ...existingMetrics,
              ...result.metrics,
              compositeScore: score,
            },
          },
        });
      }
    }

    // Fetch updated frontier
    const updatedFrontier = await this.getFrontier(familyId);
    const updatedIds = new Set(updatedFrontier.map((c) => c.id));

    // Compute delta
    const promoted = updatedFrontier.filter((c) => !previousIds.has(c.id));
    const demoted = previousFrontier.filter((c) => !updatedIds.has(c.id));
    const newBestId = updatedFrontier[0]?.id ?? null;
    const newBest =
      newBestId !== null && newBestId !== previousBestId
        ? updatedFrontier[0]!
        : null;

    // Update the swarm's currentBestCandidateId if there is a new best
    if (newBest) {
      await db.swarm.updateMany({
        where: { familyId, status: { in: ["RUNNING", "PAUSED"] } },
        data: { currentBestCandidateId: newBest.id },
      });
    }

    return {
      promoted,
      demoted,
      newBest,
      evaluatedCount,
    };
  }

  // -----------------------------------------------------------------------
  // generateMutations
  // -----------------------------------------------------------------------

  /**
   * Generate mutation plans from the current frontier.
   *
   * Strategy:
   * - Top candidates get more mutation budget (exploitation).
   * - A fraction of mutations target the weakest frontier members or
   *   random mutation types (exploration).
   * - Crossover mutations blend two frontier members.
   */
  async generateMutations(
    familyId: string,
    count: number,
  ): Promise<MutationPlan[]> {
    const frontier = await this.getFrontier(familyId);
    if (frontier.length === 0) return [];

    const plans: MutationPlan[] = [];

    // Split budget: 60% exploit top candidates, 25% explore, 15% crossover
    const exploitCount = Math.max(1, Math.floor(count * 0.6));
    const exploreCount = Math.max(1, Math.floor(count * 0.25));
    const crossoverCount = Math.max(0, count - exploitCount - exploreCount);

    // --- Exploitation: mutate top candidates ---
    for (let i = 0; i < exploitCount; i++) {
      // Weighted selection: higher-ranked candidates more likely
      const parentIdx = Math.floor(Math.random() * Math.min(3, frontier.length));
      const parent = frontier[parentIdx]!;
      const mutationType = pickRandom(MUTATION_POOL.filter((t) => t !== "crossover"));

      plans.push({
        parentId: parent.id,
        description: `Exploit: ${mutationType} on rank-${parentIdx + 1} candidate (score ${parent.compositeScore.toFixed(2)})`,
        type: mutationType,
        payload: {
          sourceScore: parent.compositeScore,
          sourceMetrics: parent.metrics,
          generation: parent.generation + 1,
        },
      });
    }

    // --- Exploration: mutate weaker or random candidates ---
    for (let i = 0; i < exploreCount; i++) {
      const parentIdx = Math.floor(
        Math.random() * frontier.length * 0.5 + frontier.length * 0.5,
      );
      const parent = frontier[Math.min(parentIdx, frontier.length - 1)]!;
      const mutationType = pickRandom(MUTATION_POOL.filter((t) => t !== "crossover"));

      plans.push({
        parentId: parent.id,
        description: `Explore: ${mutationType} on rank-${Math.min(parentIdx, frontier.length - 1) + 1} candidate`,
        type: mutationType,
        payload: {
          sourceScore: parent.compositeScore,
          sourceMetrics: parent.metrics,
          generation: parent.generation + 1,
          explorationMode: true,
        },
      });
    }

    // --- Crossover: blend two frontier members ---
    if (frontier.length >= 2) {
      for (let i = 0; i < crossoverCount; i++) {
        const [a, b] = pickTwo(frontier);
        plans.push({
          parentId: a.id,
          description: `Crossover: blend rank candidates (scores ${a.compositeScore.toFixed(2)} x ${b.compositeScore.toFixed(2)})`,
          type: "crossover",
          payload: {
            parentA: { id: a.id, metrics: a.metrics },
            parentB: { id: b.id, metrics: b.metrics },
            generation: Math.max(a.generation, b.generation) + 1,
          },
        });
      }
    }

    return plans;
  }

  // -----------------------------------------------------------------------
  // seedFromDivergence
  // -----------------------------------------------------------------------

  /**
   * Create a new strategy family seeded from a live divergence report.
   * This is the bridge between the Divergence Investigator swarm and a
   * new Frontier Explorer swarm — the divergence findings become the
   * research objective for the new family.
   *
   * Returns the new family ID.
   */
  async seedFromDivergence(
    divergenceReport: DivergenceReport,
  ): Promise<string> {
    const report = await db.divergenceReport.findUnique({
      where: { id: divergenceReport.id },
      include: {
        deployment: {
          include: {
            strategyVersion: {
              include: { family: true },
            },
          },
        },
      },
    });

    if (!report) {
      throw new Error(`Divergence report ${divergenceReport.id} not found`);
    }

    const originalFamily = report.deployment.strategyVersion.family;

    // Create a new family seeded from the divergence context
    const newFamily = await db.strategyFamily.create({
      data: {
        workspaceId: divergenceReport.workspaceId,
        slug: `${originalFamily.slug}-div-${Date.now()}`,
        name: `${originalFamily.name} — Divergence Repair`,
        description:
          `Seeded from divergence report ${divergenceReport.id} ` +
          `(severity: ${divergenceReport.severity}, score: ${divergenceReport.divergenceScore.toFixed(2)}). ` +
          `Original family: ${originalFamily.name}.`,
        objective:
          `Investigate and repair the divergence observed in deployment ` +
          `${report.deployment.id}. Entry time delta: ${divergenceReport.entryTimeDelta}, ` +
          `price delta: ${divergenceReport.priceDelta}, PnL delta: ${divergenceReport.pnlDelta}.`,
        benchmark: originalFamily.benchmark,
        universe: originalFamily.universe,
      },
    });

    return newFamily.id;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickTwo<T>(arr: T[]): [T, T] {
  const i = Math.floor(Math.random() * arr.length);
  let j = Math.floor(Math.random() * (arr.length - 1));
  if (j >= i) j++;
  return [arr[i]!, arr[j]!];
}
