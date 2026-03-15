// ---------------------------------------------------------------------------
// Autoresearch types — the research brain of nonzero
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mutation & hypothesis types
// ---------------------------------------------------------------------------

export type MutationType =
  | "parameter_tweak" // adjust top_k, lookback, thresholds
  | "scorer_swap" // swap momentum for low_vol, etc.
  | "filter_add" // add trend filter, volume filter, etc.
  | "filter_remove" // strip a filter to reduce complexity
  | "universe_shift" // change the ticker universe
  | "rebalance_change" // change rebalance frequency
  | "combination" // blend two strategies
  | "regime_adaptive" // add regime-conditional logic
  | "risk_overlay"; // add drawdown or vol-targeting overlay

export interface Hypothesis {
  id: string;
  familyId: string;
  parentStrategyId: string | null;
  mutation: MutationType;
  description: string;
  rationale: string;
  expectedImpact: {
    metric: string; // e.g. "sharpe", "alpha", "total_return"
    direction: "improve" | "degrade" | "neutral";
    magnitude: "small" | "medium" | "large";
  };
  priority: number; // 0-100, higher = try first
  createdAt: string;
}

export interface BranchInstruction {
  hypothesisId: string;
  familyId: string;
  sandboxId: string | null;
  program: string; // the full program.md content for the child worker
  strategyCode: string; // the strategy code to evaluate
  evaluationConfig: HyperspaceConfig | IndiaConfig | CustomStrategyConfig;
  timeout: number; // ms
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Research family types
// ---------------------------------------------------------------------------

export interface ResearchFamily {
  id: string;
  name: string;
  objective: string;
  universe: string[];
  benchmark: string;
  program: string; // the program.md content
  context: FamilyContext;
  frontier: StrategyCandidate[];
  generation: number;
  status: "active" | "paused" | "converged" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface FamilyInit {
  name: string;
  objective: string;
  universe: string[];
  benchmark: string;
  constraints: ProgramConstraints;
  seedStrategies?: StrategyTemplate[];
}

export interface FamilyContext {
  learnings: string[];
  failedMutations: Array<{
    mutation: MutationType;
    description: string;
    reason: string;
  }>;
  regimeNotes: string[];
  generationHistory: Array<{
    generation: number;
    bestScore: number;
    candidateCount: number;
    timestamp: string;
  }>;
}

// ---------------------------------------------------------------------------
// Strategy types
// ---------------------------------------------------------------------------

export interface StrategyCandidate {
  id: string;
  familyId: string;
  name: string;
  generation: number;
  parentId: string | null;
  mutation: MutationType | null;
  code: string;
  config: Record<string, unknown>;
  score: number;
  metrics: StrategyMetrics;
  status: "pending" | "evaluating" | "active" | "retired" | "failed";
  evaluatedAt: string | null;
}

export interface StrategyMetrics {
  totalReturn: number;
  alpha: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
  volatility: number;
  benchmarkReturn: number;
  compositeScore: number; // total_return * 1000 + alpha * 200 + sharpe * 10 + sortino - max_drawdown * 1000
}

export interface StrategyTemplate {
  name: string;
  description: string;
  lookbackMonths: number;
  topK: number;
  scorer: ScorerType;
  requireTrend: boolean;
  breakoutWindow: number | null;
  rebalanceFrequency: "monthly" | "quarterly";
  additionalFilters: StrategyFilter[];
}

export type ScorerType =
  | "momentum"
  | "low_volatility"
  | "momentum_lowvol_combo"
  | "breakout"
  | "mean_reversion"
  | "quality"
  | "value";

export interface StrategyFilter {
  type: "trend" | "volume" | "volatility" | "breakout_confirmation";
  params: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Evaluation types
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  strategyId: string;
  familyId: string;
  metrics: StrategyMetrics;
  equity_curve: Array<{ date: string; value: number }>;
  trades: number;
  holdingPeriodDays: number;
  evaluationTimeMs: number;
  environment: "hyperspace" | "local_backtest" | "paper";
  raw: Record<string, unknown>; // raw output from evaluator
  timestamp: string;
}

export interface ComparisonResult {
  strategyId: string;
  baselineId: string;
  scoreDelta: number;
  metricDeltas: Partial<Record<keyof StrategyMetrics, number>>;
  isImprovement: boolean;
  significanceLevel: number; // 0-1, statistical confidence
  recommendation: "keep" | "discard" | "needs_more_data";
}

export interface FrontierUpdate {
  familyId: string;
  generation: number;
  added: StrategyCandidate[];
  retired: StrategyCandidate[];
  frontierSize: number;
  bestScore: number;
  averageScore: number;
  improvementOverPrevious: number;
}

export interface RegimeIndicator {
  detected: boolean;
  confidence: number; // 0-1
  previousRegime: string;
  currentRegime: string;
  metrics: {
    volatilityChange: number;
    correlationShift: number;
    momentumDecay: number;
    drawdownAcceleration: number;
  };
  recommendation: "continue" | "pause_and_reassess" | "restart_search";
}

// ---------------------------------------------------------------------------
// Program types
// ---------------------------------------------------------------------------

export interface ProgramConstraints {
  maxDrawdown: number; // e.g. 0.20 for 20%
  minSharpe: number; // e.g. 0.5
  maxPositions: number; // e.g. 15
  minHoldingDays: number; // e.g. 5
  maxTurnover: number; // annual turnover ratio
  allowShort: boolean;
  allowLeverage: boolean;
  maxLeverage: number; // e.g. 1.0 for no leverage
  rebalanceFrequency: "daily" | "weekly" | "monthly" | "quarterly";
}

export interface ProgramObjective {
  goal: string;
  universe: string[];
  benchmark: string;
  constraints: ProgramConstraints;
  scoringFormula: string;
  targetMetrics: Partial<StrategyMetrics>;
}

// ---------------------------------------------------------------------------
// Evaluation configs
// ---------------------------------------------------------------------------

export interface HyperspaceConfig {
  type: "hyperspace";
  mode: "autoquant";
  iterations: number;
  verbose: boolean;
  stateFile: string; // path to autoquant-state.json
  timeout: number;
}

export interface IndiaConfig {
  type: "india";
  universe: string[];
  benchmark: string;
  strategies: StrategyTemplate[];
  startDate: string;
  endDate: string;
  initialCapital: number;
}

export interface CustomStrategyConfig {
  type: "custom";
  code: string;
  universe: string[];
  benchmark: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  sandboxImage: string;
  timeout: number;
}
