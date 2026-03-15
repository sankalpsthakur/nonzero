// ---------------------------------------------------------------------------
// Swarm Engine – Template Definitions
// ---------------------------------------------------------------------------
// Canonical template definitions for the three swarm shapes described in the
// nonzero spec.  Each template declares its agent composition, concurrency
// defaults, credit ceiling, scoring weights, and evaluation strategy.
//
// These objects are used by the orchestrator to bootstrap a swarm session and
// by the UI to display template options during swarm creation.
// ---------------------------------------------------------------------------

import type { SwarmTemplate } from "./types";
import { DEFAULT_SCORE_WEIGHTS, LIVE_SCORE_WEIGHTS } from "./types";

// ---------------------------------------------------------------------------
// 1. Frontier Explorer
// ---------------------------------------------------------------------------
// Purpose: Discover new strategy candidates via autoresearch (Lane A) mutations
//          evaluated by hyperspace (Lane B).
//
// Shape: 1 research director + 1 orchestrator + 3-10 strategy generators
//        + N evaluation workers (backtest runners) + 1 critic
// ---------------------------------------------------------------------------

export const FRONTIER_EXPLORER_TEMPLATE: SwarmTemplate = {
  slug: "frontier-explorer",
  name: "Frontier Explorer",
  description:
    "Explores the strategy frontier by mutating prompts, parameters, and " +
    "family context through autoresearch, then evaluating each mutation via " +
    "hyperspace backtests.  The critic prunes weak branches and steers the " +
    "research director towards promising regions of strategy space.",
  agents: [
    {
      kind: "RESEARCH_DIRECTOR",
      count: 1,
      mandate:
        "Owns the research objective. Decides which hypotheses to explore, " +
        "reviews critic feedback, and adjusts the mutation plan each generation.",
    },
    {
      kind: "SWARM_ORCHESTRATOR",
      count: 1,
      mandate:
        "Manages child sandbox lifecycle: spawning, heartbeat monitoring, " +
        "score collection, retirement of weak children, and promotion of winners.",
    },
    {
      kind: "STRATEGY_GENERATOR",
      count: { min: 3, max: 10 },
      mandate:
        "Generates strategy mutations from the frontier. Each generator " +
        "operates in its own sandbox, applying a single mutation plan and " +
        "producing a candidate for evaluation.",
    },
    {
      kind: "BACKTEST_RUNNER",
      count: { min: 3, max: 20 },
      mandate:
        "Runs hyperspace backtests on candidates produced by strategy " +
        "generators. Reports metrics (return, alpha, sharpe, drawdown) back " +
        "to the orchestrator.",
    },
    {
      kind: "CRITIC",
      count: 1,
      mandate:
        "Reviews evaluation results for overfit signals, statistical " +
        "significance, and diminishing returns. Recommends pruning or " +
        "doubling down on specific mutation types.",
    },
  ],
  defaultConcurrency: 5,
  defaultCreditCeiling: 500,
  scoreWeights: { ...DEFAULT_SCORE_WEIGHTS },
  evaluationStrategy: "backtest_only",
};

// ---------------------------------------------------------------------------
// 2. Robustness Auditor
// ---------------------------------------------------------------------------
// Purpose: Stress-test a promising candidate before promotion to paper/live.
//
// Shape: 1 critic lead + multiple replay/perturbation workers
//        + optional data-sensitivity worker
// ---------------------------------------------------------------------------

export const ROBUSTNESS_AUDITOR_TEMPLATE: SwarmTemplate = {
  slug: "robustness-auditor",
  name: "Robustness Auditor",
  description:
    "Subjects a candidate strategy to replay perturbations — slippage " +
    "injection, fill-rate degradation, regime shifts, data gaps — to " +
    "determine whether performance is robust or fragile. The critic lead " +
    "aggregates results into a pass/fail robustness report.",
  agents: [
    {
      kind: "CRITIC",
      count: 1,
      mandate:
        "Leads the audit. Designs perturbation scenarios, dispatches them " +
        "to workers, collects results, and produces the final robustness " +
        "report with pass/fail verdict and confidence intervals.",
    },
    {
      kind: "BACKTEST_RUNNER",
      count: { min: 3, max: 15 },
      mandate:
        "Executes a single replay perturbation scenario (e.g. 2x slippage, " +
        "random data gaps, regime-shifted prices) and reports degraded metrics " +
        "back to the critic lead.",
    },
    {
      kind: "STRATEGY_GENERATOR",
      count: { min: 0, max: 1 },
      mandate:
        "Optional data-sensitivity worker. Sweeps key parameters around " +
        "their current values to measure sensitivity and fragility scores.",
    },
  ],
  defaultConcurrency: 8,
  defaultCreditCeiling: 300,
  scoreWeights: {
    // Robustness audits penalise drawdown more heavily and weight Sharpe/Sortino
    // higher, since we care about stability not raw return.
    returnWeight: 500,
    alphaWeight: 100,
    sharpeWeight: 30,
    sortinoWeight: 20,
    drawdownPenalty: 2000,
  },
  evaluationStrategy: "replay_perturbation",
};

// ---------------------------------------------------------------------------
// 3. Live Divergence Investigator
// ---------------------------------------------------------------------------
// Purpose: When a live deployment diverges from its shadow, this swarm
//          investigates root causes and proposes repairs.
//
// Shape: 1 incident lead + 1 reconciliation agent
//        + multiple shadow-live replay workers + hypothesis repair workers
// ---------------------------------------------------------------------------

export const DIVERGENCE_INVESTIGATOR_TEMPLATE: SwarmTemplate = {
  slug: "divergence-investigator",
  name: "Live Divergence Investigator",
  description:
    "Activated when live-vs-shadow divergence exceeds thresholds. Replays " +
    "the divergent window under controlled conditions, isolates the root " +
    "cause (slippage, data feed, logic bug, regime shift), and produces " +
    "repair hypotheses that can seed a new Frontier Explorer swarm.",
  agents: [
    {
      kind: "RESEARCH_DIRECTOR",
      count: 1,
      mandate:
        "Incident lead. Triages the divergence report, defines the " +
        "investigation plan, assigns replay windows to workers, and " +
        "synthesises findings into a root-cause report.",
    },
    {
      kind: "RECONCILIATION",
      count: 1,
      mandate:
        "Reconciliation agent. Compares live execution logs against shadow " +
        "execution logs tick-by-tick, identifies the first point of " +
        "divergence, and classifies the cause category.",
    },
    {
      kind: "BACKTEST_RUNNER",
      count: { min: 2, max: 8 },
      mandate:
        "Shadow-live replay workers. Each replays the divergent time window " +
        "with a single controlled variable changed (slippage model, fill " +
        "assumptions, data source) to isolate the root cause.",
    },
    {
      kind: "STRATEGY_GENERATOR",
      count: { min: 1, max: 4 },
      mandate:
        "Hypothesis repair workers. Given the isolated root cause, propose " +
        "strategy modifications that would prevent or mitigate the " +
        "divergence. Output is a set of MutationPlans.",
    },
  ],
  defaultConcurrency: 4,
  defaultCreditCeiling: 200,
  scoreWeights: { ...LIVE_SCORE_WEIGHTS },
  evaluationStrategy: "shadow_live_comparison",
};

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/** All available swarm templates, keyed by slug. */
export const SWARM_TEMPLATES: Record<string, SwarmTemplate> = {
  [FRONTIER_EXPLORER_TEMPLATE.slug]: FRONTIER_EXPLORER_TEMPLATE,
  [ROBUSTNESS_AUDITOR_TEMPLATE.slug]: ROBUSTNESS_AUDITOR_TEMPLATE,
  [DIVERGENCE_INVESTIGATOR_TEMPLATE.slug]: DIVERGENCE_INVESTIGATOR_TEMPLATE,
};

/**
 * Look up a template by its slug. Returns `undefined` if not found.
 */
export function getTemplate(slug: string): SwarmTemplate | undefined {
  return SWARM_TEMPLATES[slug];
}

/**
 * Return all registered templates as an array, suitable for
 * listing in the UI template picker.
 */
export function listTemplates(): SwarmTemplate[] {
  return Object.values(SWARM_TEMPLATES);
}
