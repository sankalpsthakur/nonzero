// ---------------------------------------------------------------------------
// Autoresearch Controller — Lane A of the two-lane model
// ---------------------------------------------------------------------------
// The controller is the mutation/memory loop. It reads the frontier, generates
// hypotheses, creates branch instructions for sandbox workers, processes
// evaluation results, and maintains the family context (accumulated learnings).
//
// Lane A (this file): generates hypotheses, creates instructions, manages state
// Lane B (evaluator.ts): runs evaluations, compares results, detects regimes
// ---------------------------------------------------------------------------

import type {
  ResearchFamily,
  FamilyInit,
  FamilyContext,
  Hypothesis,
  BranchInstruction,
  EvaluationResult,
  FrontierUpdate,
  StrategyCandidate,
  MutationType,
  HyperspaceConfig,
  IndiaConfig,
} from "./types";
import { ProgramBuilder } from "./program-builder";
import { StrategyEvaluator } from "./evaluator";
import { INDIA_UNIVERSE, BENCHMARK, STRATEGY_TEMPLATES } from "./strategies";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of candidates to keep on the frontier. */
const MAX_FRONTIER_SIZE = 20;

/** Default branch instruction timeout (10 minutes). */
const DEFAULT_BRANCH_TIMEOUT_MS = 10 * 60 * 1000;

/** Mutation types ordered by exploration priority. */
const MUTATION_PRIORITY: MutationType[] = [
  "parameter_tweak",
  "scorer_swap",
  "filter_add",
  "combination",
  "regime_adaptive",
  "risk_overlay",
  "rebalance_change",
  "filter_remove",
  "universe_shift",
];

// ---------------------------------------------------------------------------
// AutoresearchController
// ---------------------------------------------------------------------------

export class AutoresearchController {
  private families: Map<string, ResearchFamily> = new Map();
  private programBuilder: ProgramBuilder;
  private evaluator: StrategyEvaluator;

  constructor() {
    this.programBuilder = new ProgramBuilder();
    this.evaluator = new StrategyEvaluator();
  }

  // -----------------------------------------------------------------------
  // Family lifecycle
  // -----------------------------------------------------------------------

  /**
   * Create a new research family seeded with program.md instructions.
   *
   * A family represents a lineage of strategy mutations exploring a
   * specific objective (e.g. "India large-cap momentum alpha"). The
   * initial program.md is generated from the objective, universe,
   * benchmark, and constraints.
   */
  async initializeFamily(params: FamilyInit): Promise<ResearchFamily> {
    const id = generateId("fam");

    const program = this.programBuilder.createBaseProgram(
      params.objective,
      params.universe,
      params.benchmark,
      params.constraints,
    );

    const context: FamilyContext = {
      learnings: [],
      failedMutations: [],
      regimeNotes: [],
      generationHistory: [],
    };

    const family: ResearchFamily = {
      id,
      name: params.name,
      objective: params.objective,
      universe: params.universe,
      benchmark: params.benchmark,
      program,
      context,
      frontier: [],
      generation: 0,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Seed with provided templates if any
    if (params.seedStrategies && params.seedStrategies.length > 0) {
      for (const template of params.seedStrategies) {
        const candidate: StrategyCandidate = {
          id: generateId("strat"),
          familyId: id,
          name: template.name,
          generation: 0,
          parentId: null,
          mutation: null,
          code: JSON.stringify(template),
          config: template as unknown as Record<string, unknown>,
          score: 0,
          metrics: emptyMetrics(),
          status: "pending",
          evaluatedAt: null,
        };
        family.frontier.push(candidate);
      }
    }

    this.families.set(id, family);
    return family;
  }

  // -----------------------------------------------------------------------
  // Hypothesis generation
  // -----------------------------------------------------------------------

  /**
   * Generate N mutation hypotheses for a research family.
   *
   * Reads the current frontier and program.md context to propose mutations
   * that are likely to improve the composite score. The hypotheses are
   * prioritised based on:
   *
   * 1. What mutation types haven't been explored yet.
   * 2. Which frontier candidates are most promising as parents.
   * 3. What learnings suggest about productive directions.
   * 4. Avoiding mutations that have already failed.
   */
  async generateHypotheses(
    familyId: string,
    count: number,
  ): Promise<Hypothesis[]> {
    const family = this.getFamily(familyId);
    const hypotheses: Hypothesis[] = [];

    // Determine which mutation types to prioritise
    const failedTypes = new Set(
      family.context.failedMutations.map((f) => f.mutation),
    );
    const prioritisedTypes = MUTATION_PRIORITY.filter(
      (t) => !failedTypes.has(t),
    );

    // Select parent candidates from the frontier (best first)
    const parents = [...family.frontier]
      .filter((c) => c.status === "active" || c.status === "pending")
      .sort((a, b) => b.score - a.score);

    for (let i = 0; i < count; i++) {
      // Cycle through mutation types
      const mutationType =
        prioritisedTypes[i % prioritisedTypes.length] ??
        MUTATION_PRIORITY[i % MUTATION_PRIORITY.length];

      // Pick a parent (round-robin through top candidates)
      const parent = parents.length > 0
        ? parents[i % parents.length]
        : null;

      const hypothesis: Hypothesis = {
        id: generateId("hyp"),
        familyId,
        parentStrategyId: parent?.id ?? null,
        mutation: mutationType,
        description: generateHypothesisDescription(
          mutationType,
          parent,
          family.context.learnings,
        ),
        rationale: generateHypothesisRationale(
          mutationType,
          parent,
          family.context,
        ),
        expectedImpact: estimateImpact(mutationType, parent),
        priority: computeHypothesisPriority(
          mutationType,
          parent,
          family.context,
          i,
        ),
        createdAt: new Date().toISOString(),
      };

      hypotheses.push(hypothesis);
    }

    // Sort by priority descending
    hypotheses.sort((a, b) => b.priority - a.priority);

    return hypotheses;
  }

  // -----------------------------------------------------------------------
  // Branch instructions
  // -----------------------------------------------------------------------

  /**
   * Create specific instructions for a sandbox worker to test a hypothesis.
   *
   * The branch instruction contains the full program.md context plus the
   * specific mutation task, ready to be dispatched to a hyperspace worker.
   */
  async createBranchInstructions(
    hypothesis: Hypothesis,
  ): Promise<BranchInstruction> {
    const family = this.getFamily(hypothesis.familyId);

    // Build the mutation prompt from the family program + hypothesis
    const mutationPrompt = this.programBuilder.createMutationPrompt(
      family.program,
      hypothesis,
    );

    // Determine the evaluation config based on the family universe
    const evaluationConfig = buildEvaluationConfig(family, hypothesis);

    // Find the parent strategy code if applicable
    const parent = hypothesis.parentStrategyId
      ? family.frontier.find((c) => c.id === hypothesis.parentStrategyId)
      : null;

    return {
      hypothesisId: hypothesis.id,
      familyId: hypothesis.familyId,
      sandboxId: null, // assigned when the worker picks up the task
      program: mutationPrompt,
      strategyCode: parent?.code ?? "",
      evaluationConfig,
      timeout: DEFAULT_BRANCH_TIMEOUT_MS,
      retryCount: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Result processing
  // -----------------------------------------------------------------------

  /**
   * Process evaluation results and update the family frontier.
   *
   * For each result:
   * 1. Compute the composite score.
   * 2. Determine if the candidate enters the frontier.
   * 3. Retire the weakest candidates if the frontier exceeds capacity.
   * 4. Record the generation history.
   *
   * Returns a FrontierUpdate describing what changed.
   */
  async processResults(
    familyId: string,
    results: EvaluationResult[],
  ): Promise<FrontierUpdate> {
    const family = this.getFamily(familyId);

    const added: StrategyCandidate[] = [];
    const retired: StrategyCandidate[] = [];

    for (const result of results) {
      // Compute composite score
      const compositeScore = StrategyEvaluator.computeCompositeScore(
        result.metrics,
      );

      // Create the candidate record
      const candidate: StrategyCandidate = {
        id: result.strategyId,
        familyId,
        name: result.strategyId,
        generation: family.generation + 1,
        parentId: null,
        mutation: null,
        code: JSON.stringify(result.raw),
        config: result.raw,
        score: compositeScore,
        metrics: result.metrics,
        status: "active",
        evaluatedAt: result.timestamp,
      };

      // Determine the frontier threshold (score of the weakest member)
      const frontierThreshold =
        family.frontier.length >= MAX_FRONTIER_SIZE
          ? Math.min(...family.frontier.map((c) => c.score))
          : -Infinity;

      if (compositeScore > frontierThreshold) {
        // This candidate enters the frontier
        family.frontier.push(candidate);
        added.push(candidate);

        // Retire the weakest if we exceed capacity
        if (family.frontier.length > MAX_FRONTIER_SIZE) {
          family.frontier.sort((a, b) => b.score - a.score);
          const toRetire = family.frontier.splice(MAX_FRONTIER_SIZE);
          for (const r of toRetire) {
            r.status = "retired";
            retired.push(r);
          }
        }
      } else {
        // Candidate doesn't make the cut
        candidate.status = "retired";
        retired.push(candidate);
      }
    }

    // Advance generation
    family.generation += 1;

    // Record generation history
    const scores = family.frontier.map((c) => c.score);
    const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const averageScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

    const previousBest =
      family.context.generationHistory.length > 0
        ? family.context.generationHistory[
            family.context.generationHistory.length - 1
          ].bestScore
        : 0;

    family.context.generationHistory.push({
      generation: family.generation,
      bestScore,
      candidateCount: family.frontier.length,
      timestamp: new Date().toISOString(),
    });

    family.updatedAt = new Date().toISOString();

    // Update the program with current frontier
    family.program = this.programBuilder.enrichProgram(
      family.program,
      family.context.learnings,
      family.frontier,
    );

    return {
      familyId,
      generation: family.generation,
      added,
      retired,
      frontierSize: family.frontier.length,
      bestScore,
      averageScore,
      improvementOverPrevious: bestScore - previousBest,
    };
  }

  // -----------------------------------------------------------------------
  // Learning & context
  // -----------------------------------------------------------------------

  /**
   * Enrich the family context with new learnings.
   *
   * Learnings are accumulated over time and incorporated into the program.md
   * so that future hypothesis generation can avoid dead ends and build on
   * successful patterns.
   */
  async updateFamilyContext(
    familyId: string,
    learnings: string[],
  ): Promise<void> {
    const family = this.getFamily(familyId);

    family.context.learnings.push(...learnings);
    family.updatedAt = new Date().toISOString();

    // Re-enrich the program with updated learnings
    family.program = this.programBuilder.enrichProgram(
      family.program,
      family.context.learnings,
      family.frontier,
    );
  }

  // -----------------------------------------------------------------------
  // Divergence seeding
  // -----------------------------------------------------------------------

  /**
   * Create a new family seeded from a live divergence report.
   *
   * When the live system detects that actual performance diverges from
   * backtested expectations, this method creates a new research family
   * specifically aimed at investigating and resolving the mismatch.
   *
   * @param divergenceReport - The divergence report from the live system.
   * @returns The ID of the newly created family.
   */
  async seedFromDivergence(divergenceReport: {
    deploymentId: string;
    divergenceScore: number;
    severity: string;
    pnlDelta: number | null;
    entryTimeDelta: number | null;
    fillRateDelta: number | null;
  }): Promise<string> {
    const objective = buildDivergenceObjective(divergenceReport);

    const family = await this.initializeFamily({
      name: `divergence_investigation_${divergenceReport.deploymentId}`,
      objective,
      universe: INDIA_UNIVERSE,
      benchmark: BENCHMARK,
      constraints: {
        maxDrawdown: 0.20,
        minSharpe: 0.5,
        maxPositions: 15,
        minHoldingDays: 5,
        maxTurnover: 12,
        allowShort: false,
        allowLeverage: false,
        maxLeverage: 1.0,
        rebalanceFrequency: "monthly",
      },
      seedStrategies: STRATEGY_TEMPLATES,
    });

    // Add divergence context as initial learnings
    const divergenceLearnings = [
      `DIVERGENCE INVESTIGATION: deployment ${divergenceReport.deploymentId} showed severity=${divergenceReport.severity}, score=${divergenceReport.divergenceScore.toFixed(2)}.`,
      divergenceReport.pnlDelta !== null
        ? `PnL delta: ${(divergenceReport.pnlDelta * 100).toFixed(1)}% — live performance deviates from backtest.`
        : null,
      divergenceReport.entryTimeDelta !== null
        ? `Entry time delta: ${divergenceReport.entryTimeDelta}ms — execution timing differs from model.`
        : null,
      divergenceReport.fillRateDelta !== null
        ? `Fill rate delta: ${(divergenceReport.fillRateDelta * 100).toFixed(1)}% — fill assumptions may be wrong.`
        : null,
      "Focus: investigate whether the divergence is due to regime change, execution slippage, or model overfitting.",
    ].filter((l): l is string => l !== null);

    await this.updateFamilyContext(family.id, divergenceLearnings);

    return family.id;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Get a family by ID, throwing if not found. */
  getFamily(familyId: string): ResearchFamily {
    const family = this.families.get(familyId);
    if (!family) {
      throw new Error(`Research family not found: ${familyId}`);
    }
    return family;
  }

  /** Get all active families. */
  getActiveFamilies(): ResearchFamily[] {
    return Array.from(this.families.values()).filter(
      (f) => f.status === "active",
    );
  }

  /** Get the evaluator instance for direct evaluation calls. */
  getEvaluator(): StrategyEvaluator {
    return this.evaluator;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a prefixed unique ID. */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/** Create an empty metrics object with all zeros. */
function emptyMetrics() {
  return {
    totalReturn: 0,
    alpha: 0,
    sharpe: 0,
    sortino: 0,
    maxDrawdown: 0,
    calmar: 0,
    winRate: 0,
    volatility: 0,
    benchmarkReturn: 0,
    compositeScore: 0,
  };
}

/**
 * Generate a human-readable description for a hypothesis based on its
 * mutation type and parent strategy.
 */
function generateHypothesisDescription(
  mutation: MutationType,
  parent: StrategyCandidate | null,
  learnings: string[],
): string {
  const parentName = parent?.name ?? "base template";

  const descriptions: Record<MutationType, string> = {
    parameter_tweak: `Tweak parameters (lookback, topK) of "${parentName}" to explore nearby configurations.`,
    scorer_swap: `Replace the scoring function of "${parentName}" with an alternative scorer to test a different factor.`,
    filter_add: `Add a new filter (trend, volume, or breakout) to "${parentName}" to improve signal quality.`,
    filter_remove: `Remove a filter from "${parentName}" to reduce complexity and test if the filter adds value.`,
    universe_shift: `Change the ticker universe for "${parentName}" to explore a different market segment.`,
    rebalance_change: `Change the rebalance frequency of "${parentName}" to test timing sensitivity.`,
    combination: `Blend "${parentName}" with another strategy factor to create a multi-signal approach.`,
    regime_adaptive: `Add regime-conditional logic to "${parentName}" so it adapts to market conditions.`,
    risk_overlay: `Add a risk management overlay to "${parentName}" to cap drawdowns and volatility.`,
  };

  let desc = descriptions[mutation];

  // If we have relevant learnings, reference them
  const relevantLearning = learnings.find((l) =>
    l.toLowerCase().includes(mutation.replace("_", " ")),
  );
  if (relevantLearning) {
    desc += ` (informed by prior learning: "${relevantLearning.substring(0, 80)}...")`;
  }

  return desc;
}

/**
 * Generate the rationale for why this hypothesis is worth testing.
 */
function generateHypothesisRationale(
  mutation: MutationType,
  parent: StrategyCandidate | null,
  context: FamilyContext,
): string {
  const parentScore = parent?.score ?? 0;
  const failedSameType = context.failedMutations.filter(
    (f) => f.mutation === mutation,
  );

  let rationale = "";

  if (parent && parentScore > 0) {
    rationale += `Parent "${parent.name}" has score ${parentScore.toFixed(1)}. `;
  }

  if (failedSameType.length > 0) {
    rationale += `Note: ${failedSameType.length} prior ${mutation} mutations failed — this attempt uses a different angle. `;
  }

  switch (mutation) {
    case "parameter_tweak":
      rationale += "Small parameter changes can unlock meaningful score improvements with low risk of regression.";
      break;
    case "scorer_swap":
      rationale += "Testing alternative factors may reveal unexploited alpha sources.";
      break;
    case "filter_add":
      rationale += "Adding a filter can improve precision by eliminating low-quality signals.";
      break;
    case "filter_remove":
      rationale += "Simpler strategies may generalise better out-of-sample.";
      break;
    case "universe_shift":
      rationale += "Different market segments may offer higher alpha for this strategy type.";
      break;
    case "rebalance_change":
      rationale += "Rebalance frequency affects both transaction costs and signal decay.";
      break;
    case "combination":
      rationale += "Multi-factor approaches tend to be more robust than single-factor strategies.";
      break;
    case "regime_adaptive":
      rationale += "Regime adaptation can reduce drawdowns during adverse market conditions.";
      break;
    case "risk_overlay":
      rationale += "Risk overlays protect capital and improve risk-adjusted returns.";
      break;
  }

  return rationale;
}

/**
 * Estimate the expected impact of a mutation type.
 */
function estimateImpact(
  mutation: MutationType,
  parent: StrategyCandidate | null,
): Hypothesis["expectedImpact"] {
  const impactMap: Record<
    MutationType,
    { metric: string; direction: "improve"; magnitude: "small" | "medium" | "large" }
  > = {
    parameter_tweak: { metric: "compositeScore", direction: "improve", magnitude: "small" },
    scorer_swap: { metric: "alpha", direction: "improve", magnitude: "medium" },
    filter_add: { metric: "sharpe", direction: "improve", magnitude: "medium" },
    filter_remove: { metric: "sharpe", direction: "improve", magnitude: "small" },
    universe_shift: { metric: "alpha", direction: "improve", magnitude: "large" },
    rebalance_change: { metric: "total_return", direction: "improve", magnitude: "small" },
    combination: { metric: "sharpe", direction: "improve", magnitude: "medium" },
    regime_adaptive: { metric: "maxDrawdown", direction: "improve", magnitude: "large" },
    risk_overlay: { metric: "maxDrawdown", direction: "improve", magnitude: "medium" },
  };

  return impactMap[mutation];
}

/**
 * Compute a priority score (0-100) for a hypothesis.
 */
function computeHypothesisPriority(
  mutation: MutationType,
  parent: StrategyCandidate | null,
  context: FamilyContext,
  index: number,
): number {
  let priority = 50;

  // Boost priority for mutation types that haven't been tried
  const failedCount = context.failedMutations.filter(
    (f) => f.mutation === mutation,
  ).length;
  priority -= failedCount * 10;

  // Boost priority for promising parents
  if (parent && parent.score > 0) {
    priority += Math.min(parent.score * 2, 20);
  }

  // Slight decay for later hypotheses in a batch
  priority -= index * 2;

  // Type-based base priority
  const typeBoost: Record<MutationType, number> = {
    parameter_tweak: 10,
    scorer_swap: 8,
    filter_add: 7,
    combination: 6,
    regime_adaptive: 5,
    risk_overlay: 4,
    rebalance_change: 3,
    filter_remove: 2,
    universe_shift: 1,
  };
  priority += typeBoost[mutation] ?? 0;

  return Math.max(0, Math.min(100, priority));
}

/**
 * Build the evaluation config appropriate for a family.
 */
function buildEvaluationConfig(
  family: ResearchFamily,
  _hypothesis: Hypothesis,
): HyperspaceConfig | IndiaConfig {
  // If the family uses the India universe, use IndiaConfig
  const isIndiaFamily = family.universe.some((t) => t.endsWith(".NS"));

  if (isIndiaFamily) {
    return {
      type: "india",
      universe: family.universe,
      benchmark: family.benchmark,
      strategies: STRATEGY_TEMPLATES,
      startDate: "2020-01-01",
      endDate: new Date().toISOString().split("T")[0],
      initialCapital: 1_000_000,
    };
  }

  // Default to hyperspace
  return {
    type: "hyperspace",
    mode: "autoquant",
    iterations: 1,
    verbose: true,
    stateFile: "~/.hyperspace/autoquant/autoquant-state.json",
    timeout: DEFAULT_BRANCH_TIMEOUT_MS,
  };
}

/**
 * Build the research objective for a divergence investigation family.
 */
function buildDivergenceObjective(divergenceReport: {
  deploymentId: string;
  divergenceScore: number;
  severity: string;
  pnlDelta: number | null;
}): string {
  const parts = [
    `Investigate and resolve the live performance divergence detected in deployment "${divergenceReport.deploymentId}".`,
    `Divergence severity: ${divergenceReport.severity} (score: ${divergenceReport.divergenceScore.toFixed(2)}).`,
  ];

  if (divergenceReport.pnlDelta !== null) {
    parts.push(
      `The live PnL deviates from the backtested PnL by ${(divergenceReport.pnlDelta * 100).toFixed(1)}%.`,
    );
  }

  parts.push(
    "Goal: discover strategy modifications that close the gap between backtested and live performance, " +
    "while maintaining or improving the composite score.",
  );

  return parts.join(" ");
}
