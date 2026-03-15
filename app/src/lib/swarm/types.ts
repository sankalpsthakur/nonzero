// ---------------------------------------------------------------------------
// Swarm Engine – Type Definitions
// ---------------------------------------------------------------------------
// These types mirror and extend the Prisma schema for the swarm subsystem,
// providing the shapes used at the application layer by the orchestrator,
// frontier manager, scoring, and template modules.
// ---------------------------------------------------------------------------

import type {
  SwarmStatus as PrismaSwarmStatus,
  SwarmChildStatus as PrismaSwarmChildStatus,
  AgentKind,
  DivergenceSeverity,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Re-exports from Prisma (canonical source of truth for DB enums)
// ---------------------------------------------------------------------------

export type SwarmStatus = PrismaSwarmStatus;
export type SwarmChildStatus = PrismaSwarmChildStatus;
export type { AgentKind, DivergenceSeverity };

// ---------------------------------------------------------------------------
// Swarm Configuration & Sessions
// ---------------------------------------------------------------------------

/** Configuration passed to `SwarmOrchestrator.launch()`. */
export interface SwarmConfig {
  workspaceId: string;
  familyId: string;
  templateId: string;
  name: string;
  objective?: string;
  /** Maximum concurrent children. Overrides template default if provided. */
  maxConcurrency?: number;
  /** Credit ceiling for the entire swarm run. */
  creditCeiling: number;
  /** Optional score weight overrides for this swarm. */
  scoreWeights?: Partial<ScoreWeights>;
  /** Lanes to activate. Both enabled by default. */
  lanes?: {
    autoresearch?: boolean;
    hyperspace?: boolean;
  };
}

/** A running (or completed) swarm session, returned by `launch()`. */
export interface SwarmSession {
  id: string;
  workspaceId: string;
  familyId: string;
  templateId: string;
  name: string;
  objective: string | null;
  status: SwarmStatus;
  maxConcurrency: number;
  activeChildCount: number;
  creditReservationId: string | null;
  currentBestCandidateId: string | null;
  failureRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Swarm Children
// ---------------------------------------------------------------------------

/** Configuration for spawning a single child sandbox. */
export interface ChildConfig {
  /** Human-readable label for this child. */
  label?: string;
  /** The hypothesis this child is testing. */
  hypothesis: string;
  /** Run environment (defaults to RESEARCH). */
  environment?: "RESEARCH" | "PAPER" | "SHADOW_LIVE" | "LIVE";
  /** Configuration JSON forwarded to the sandbox. */
  runConfig?: Record<string, unknown>;
  /** Experiment ID to associate the child's run with. */
  experimentId: string;
}

/** A running child within a swarm. */
export interface SwarmChildSession {
  id: string;
  swarmId: string;
  runId: string | null;
  status: SwarmChildStatus;
  hypothesis: string | null;
  score: number | null;
  metrics: StrategyMetrics | null;
  createdAt: Date;
  completedAt: Date | null;
}

/** A child annotated with its rank within the swarm. */
export interface RankedChild {
  childId: string;
  runId: string | null;
  hypothesis: string | null;
  rank: number;
  score: number;
  metrics: StrategyMetrics | null;
  status: SwarmChildStatus;
}

// ---------------------------------------------------------------------------
// Strategy & Metrics
// ---------------------------------------------------------------------------

/** Raw metrics produced by hyperspace evaluation. */
export interface StrategyMetrics {
  /** Annualised total return (decimal, e.g. 0.15 = 15%). */
  totalReturn: number;
  /** Alpha vs benchmark (decimal). */
  alpha: number;
  /** Sharpe ratio (annualised). */
  sharpe: number;
  /** Sortino ratio (annualised). */
  sortino: number;
  /** Maximum drawdown (decimal, positive number, e.g. 0.12 = 12%). */
  maxDrawdown: number;
  /** Win rate (0-1). */
  winRate: number;
  /** Profit factor (gross profits / gross losses). */
  profitFactor: number;
  /** Number of trades in backtest. */
  tradeCount: number;
  /** In-sample Sharpe (used for overfit detection). */
  inSampleSharpe?: number;
  /** Out-of-sample Sharpe (used for overfit detection). */
  outOfSampleSharpe?: number;
  /** Backtest horizon in calendar days. */
  backtestDays?: number;
  /** Paper trading duration in calendar days. */
  paperDays?: number;
  /** Parameter sensitivity score (0 = robust, 1 = fragile). */
  parameterSensitivity?: number;
}

/** A strategy candidate within the frontier. */
export interface StrategyCandidate {
  id: string;
  familyId: string;
  /** Version or generation number. */
  generation: number;
  /** The code / prompt snapshot that produced this candidate. */
  codeSnapshotId?: string;
  /** Mutation that created this candidate (null for seed). */
  parentId: string | null;
  mutationDescription: string | null;
  metrics: StrategyMetrics;
  /** Composite score computed by the scoring module. */
  compositeScore: number;
  createdAt: Date;
}

/** Result from hyperspace evaluation, fed back to the frontier. */
export interface EvaluationResult {
  candidateId: string;
  metrics: StrategyMetrics;
  /** Whether the evaluation succeeded or errored. */
  success: boolean;
  /** Error message if the evaluation failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Mutations & Frontier
// ---------------------------------------------------------------------------

/** Plan for a single mutation produced by autoresearch (Lane A). */
export interface MutationPlan {
  /** Parent candidate ID this mutation derives from. */
  parentId: string;
  /** Human-readable description of the mutation. */
  description: string;
  /** Mutation type (e.g. prompt tweak, parameter sweep, regime change). */
  type: MutationType;
  /** Payload consumed by the sandbox to execute the mutation. */
  payload: Record<string, unknown>;
}

export type MutationType =
  | "prompt_tweak"
  | "parameter_sweep"
  | "regime_shift"
  | "universe_change"
  | "risk_profile_change"
  | "signal_combination"
  | "timeframe_change"
  | "crossover";

/** Delta returned by `FrontierManager.updateFrontier()`. */
export interface FrontierDelta {
  /** Candidates that entered the top-K frontier. */
  promoted: StrategyCandidate[];
  /** Candidates that fell out of the top-K frontier. */
  demoted: StrategyCandidate[];
  /** New overall best candidate, if it changed. */
  newBest: StrategyCandidate | null;
  /** Number of candidates evaluated. */
  evaluatedCount: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Weights for the composite scoring formula. */
export interface ScoreWeights {
  /** Weight for total return. Default: 1000 */
  returnWeight: number;
  /** Weight for alpha. Default: 100 */
  alphaWeight: number;
  /** Weight for Sharpe ratio. Default: 10 */
  sharpeWeight: number;
  /** Weight for Sortino ratio. Default: 5 */
  sortinoWeight: number;
  /** Penalty weight for max drawdown. Default: 1000 */
  drawdownPenalty: number;
}

/** Default weights matching the spec formula. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  returnWeight: 1000,
  alphaWeight: 100,
  sharpeWeight: 10,
  sortinoWeight: 5,
  drawdownPenalty: 1000,
};

/** Default weights tuned for live deployment (penalise drawdown more). */
export const LIVE_SCORE_WEIGHTS: ScoreWeights = {
  returnWeight: 800,
  alphaWeight: 150,
  sharpeWeight: 20,
  sortinoWeight: 10,
  drawdownPenalty: 2000,
};

/** Ranked strategy returned by scoring functions. */
export interface RankedStrategy {
  candidateId: string;
  rank: number;
  compositeScore: number;
  metrics: StrategyMetrics;
}

/** Indicators used to detect over-fitting. */
export interface OverfitIndicators {
  /** Ratio of out-of-sample to in-sample Sharpe. < 0.5 is suspect. */
  sharpeDegradation: number | null;
  /** Whether parameter sensitivity is above threshold. */
  parameterFragile: boolean;
  /** Whether the strategy relies on too few trades. */
  lowTradeCount: boolean;
  /** Overall overfit risk: low / medium / high. */
  risk: "low" | "medium" | "high";
  /** Human-readable reasons. */
  reasons: string[];
}

/** Result of running qualification gates against a candidate. */
export interface QualificationResult {
  /** Did the candidate pass all gates? */
  passed: boolean;
  /** Individual gate results. */
  gates: QualificationGate[];
}

export interface QualificationGate {
  name: string;
  passed: boolean;
  /** Actual value observed. */
  actual: number | null;
  /** Threshold required. */
  threshold: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Promotion & Health
// ---------------------------------------------------------------------------

/** Result of promoting the winning child of a swarm. */
export interface PromotionResult {
  /** The child that was promoted. */
  childId: string;
  /** The strategy version ID created for the winner. */
  strategyVersionId: string;
  /** The status the strategy was promoted to. */
  promotedTo: "TESTING" | "PAPER" | "SHADOW_LIVE";
  /** Composite score of the promoted candidate. */
  score: number;
}

/** Health report for all children in a swarm. */
export interface HealthReport {
  swarmId: string;
  totalChildren: number;
  healthy: number;
  unhealthy: number;
  /** Children that missed their last heartbeat. */
  staleChildren: string[];
  /** Children that have errored / failed. */
  failedChildren: string[];
  /** Overall swarm health. */
  status: "healthy" | "degraded" | "critical";
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Swarm Templates
// ---------------------------------------------------------------------------

/** Agent role within a swarm template. */
export interface AgentRole {
  kind: AgentKind;
  /** How many of this agent type. Use `{ min, max }` for elastic roles. */
  count: number | { min: number; max: number };
  /** Human-readable mandate / purpose for this role. */
  mandate: string;
}

/** Full swarm template definition used by the template module. */
export interface SwarmTemplate {
  /** Unique template slug (maps to `SwarmTemplate.id` in DB). */
  slug: string;
  name: string;
  description: string;
  /** Agent composition for this swarm shape. */
  agents: AgentRole[];
  /** Default max concurrency for children. */
  defaultConcurrency: number;
  /** Default credit ceiling (in platform credits). */
  defaultCreditCeiling: number;
  /** Weights for the composite objective function. */
  scoreWeights: ScoreWeights;
  /** How hyperspace should evaluate candidates in this swarm type. */
  evaluationStrategy: EvaluationStrategy;
}

export type EvaluationStrategy =
  | "backtest_only"
  | "backtest_then_paper"
  | "replay_perturbation"
  | "shadow_live_comparison";

// ---------------------------------------------------------------------------
// Divergence (used by the Live Divergence Investigator)
// ---------------------------------------------------------------------------

export interface DivergenceReport {
  id: string;
  deploymentId: string;
  workspaceId: string;
  entryTimeDelta: number | null;
  priceDelta: number | null;
  fillRateDelta: number | null;
  positionDelta: number | null;
  pnlDelta: number | null;
  divergenceScore: number;
  severity: DivergenceSeverity;
  createdAt: Date;
}
