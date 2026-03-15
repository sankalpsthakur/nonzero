// ---------------------------------------------------------------------------
// Swarm Engine – Scoring & Ranking
// ---------------------------------------------------------------------------
// Composite scoring, ranking, overfit detection, and qualification gates.
// The scoring formula matches the spec:
//   return * W_ret + alpha * W_alpha + sharpe * W_sharpe + sortino * W_sort - drawdown * W_dd
// ---------------------------------------------------------------------------

import type {
  StrategyCandidate,
  StrategyMetrics,
  ScoreWeights,
  RankedStrategy,
  OverfitIndicators,
  QualificationResult,
  QualificationGate,
} from "./types";
import { DEFAULT_SCORE_WEIGHTS } from "./types";

// ---------------------------------------------------------------------------
// Thresholds (tunable; pulled out for clarity)
// ---------------------------------------------------------------------------

/** Ratio of OOS/IS Sharpe below which we flag overfit. */
const SHARPE_DEGRADATION_THRESHOLD = 0.5;

/** Parameter sensitivity above this value is considered fragile. */
const PARAMETER_SENSITIVITY_THRESHOLD = 0.6;

/** Minimum number of trades to be considered statistically meaningful. */
const MIN_TRADES_FOR_CONFIDENCE = 30;

// ---------------------------------------------------------------------------
// Qualification gate defaults
// ---------------------------------------------------------------------------

const QUALIFICATION_DEFAULTS = {
  minBacktestDays: 252, // ~1 year of trading days
  minPaperDays: 21, // ~1 month paper trading
  maxDrawdown: 0.25, // 25%
  minSharpe: 0.5,
  minTradeCount: 30,
  minProfitFactor: 1.1,
  minWinRate: 0.35,
} as const;

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Compute a single composite score for a set of strategy metrics.
 *
 * Formula:
 *   totalReturn * returnWeight
 * + alpha       * alphaWeight
 * + sharpe      * sharpeWeight
 * + sortino     * sortinoWeight
 * - maxDrawdown * drawdownPenalty
 */
export function computeScore(
  metrics: StrategyMetrics,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): number {
  const raw =
    metrics.totalReturn * weights.returnWeight +
    metrics.alpha * weights.alphaWeight +
    metrics.sharpe * weights.sharpeWeight +
    metrics.sortino * weights.sortinoWeight -
    metrics.maxDrawdown * weights.drawdownPenalty;

  // Round to 6 decimal places to avoid floating-point noise in comparisons.
  return Math.round(raw * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Rank a list of strategy candidates by their composite score (descending).
 * Ties are broken by lower max drawdown, then by higher Sharpe.
 */
export function rankStrategies(
  candidates: StrategyCandidate[],
  weights?: ScoreWeights,
): RankedStrategy[] {
  const scored = candidates.map((c) => ({
    candidateId: c.id,
    compositeScore: weights ? computeScore(c.metrics, weights) : c.compositeScore,
    metrics: c.metrics,
  }));

  scored.sort((a, b) => {
    // Primary: higher composite score first.
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    // Secondary: lower drawdown wins.
    if (a.metrics.maxDrawdown !== b.metrics.maxDrawdown) {
      return a.metrics.maxDrawdown - b.metrics.maxDrawdown;
    }
    // Tertiary: higher Sharpe wins.
    return b.metrics.sharpe - a.metrics.sharpe;
  });

  return scored.map((s, idx) => ({
    ...s,
    rank: idx + 1,
  }));
}

// ---------------------------------------------------------------------------
// Overfit detection
// ---------------------------------------------------------------------------

/**
 * Analyse a candidate for overfitting signals.
 *
 * Checks:
 * 1. In-sample vs out-of-sample Sharpe degradation
 * 2. Parameter sensitivity (fragile = small param changes cause big score swings)
 * 3. Low trade count (strategy may have been curve-fit to a few lucky trades)
 */
export function detectOverfit(
  candidate: StrategyCandidate,
): OverfitIndicators {
  const { metrics } = candidate;
  const reasons: string[] = [];

  // 1. Sharpe degradation
  let sharpeDegradation: number | null = null;
  if (
    metrics.inSampleSharpe != null &&
    metrics.outOfSampleSharpe != null &&
    metrics.inSampleSharpe > 0
  ) {
    sharpeDegradation = metrics.outOfSampleSharpe / metrics.inSampleSharpe;
    if (sharpeDegradation < SHARPE_DEGRADATION_THRESHOLD) {
      reasons.push(
        `Sharpe degrades ${((1 - sharpeDegradation) * 100).toFixed(0)}% out-of-sample ` +
          `(IS: ${metrics.inSampleSharpe.toFixed(2)}, OOS: ${metrics.outOfSampleSharpe.toFixed(2)})`,
      );
    }
  }

  // 2. Parameter sensitivity
  const parameterFragile =
    (metrics.parameterSensitivity ?? 0) > PARAMETER_SENSITIVITY_THRESHOLD;
  if (parameterFragile) {
    reasons.push(
      `Parameter sensitivity ${(metrics.parameterSensitivity! * 100).toFixed(0)}% ` +
        `exceeds ${(PARAMETER_SENSITIVITY_THRESHOLD * 100).toFixed(0)}% threshold`,
    );
  }

  // 3. Low trade count
  const lowTradeCount = metrics.tradeCount < MIN_TRADES_FOR_CONFIDENCE;
  if (lowTradeCount) {
    reasons.push(
      `Only ${metrics.tradeCount} trades (minimum ${MIN_TRADES_FOR_CONFIDENCE} for statistical confidence)`,
    );
  }

  // Aggregate risk level
  const flagCount =
    (sharpeDegradation !== null && sharpeDegradation < SHARPE_DEGRADATION_THRESHOLD ? 1 : 0) +
    (parameterFragile ? 1 : 0) +
    (lowTradeCount ? 1 : 0);

  let risk: OverfitIndicators["risk"];
  if (flagCount >= 2) {
    risk = "high";
  } else if (flagCount === 1) {
    risk = "medium";
  } else {
    risk = "low";
  }

  return {
    sharpeDegradation,
    parameterFragile,
    lowTradeCount,
    risk,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Qualification gates
// ---------------------------------------------------------------------------

/**
 * Run the candidate through a series of qualification gates that must all
 * pass before the strategy can be promoted to paper or live trading.
 *
 * Gates:
 * - Minimum backtest horizon (calendar days)
 * - Minimum paper trading duration (calendar days)
 * - Maximum drawdown
 * - Minimum Sharpe ratio
 * - Minimum trade count
 * - Minimum profit factor
 * - Minimum win rate
 */
export function qualificationGates(
  candidate: StrategyCandidate,
  overrides?: Partial<typeof QUALIFICATION_DEFAULTS>,
): QualificationResult {
  const thresholds = { ...QUALIFICATION_DEFAULTS, ...overrides };
  const { metrics } = candidate;
  const gates: QualificationGate[] = [];

  // Gate: backtest horizon
  gates.push({
    name: "min_backtest_horizon",
    passed: (metrics.backtestDays ?? 0) >= thresholds.minBacktestDays,
    actual: metrics.backtestDays ?? null,
    threshold: thresholds.minBacktestDays,
    message:
      (metrics.backtestDays ?? 0) >= thresholds.minBacktestDays
        ? `Backtest covers ${metrics.backtestDays} days`
        : `Backtest only ${metrics.backtestDays ?? 0} days (need ${thresholds.minBacktestDays})`,
  });

  // Gate: paper trading duration
  gates.push({
    name: "min_paper_duration",
    passed: (metrics.paperDays ?? 0) >= thresholds.minPaperDays,
    actual: metrics.paperDays ?? null,
    threshold: thresholds.minPaperDays,
    message:
      (metrics.paperDays ?? 0) >= thresholds.minPaperDays
        ? `Paper traded for ${metrics.paperDays} days`
        : `Paper only ${metrics.paperDays ?? 0} days (need ${thresholds.minPaperDays})`,
  });

  // Gate: max drawdown
  gates.push({
    name: "max_drawdown",
    passed: metrics.maxDrawdown <= thresholds.maxDrawdown,
    actual: metrics.maxDrawdown,
    threshold: thresholds.maxDrawdown,
    message:
      metrics.maxDrawdown <= thresholds.maxDrawdown
        ? `Max drawdown ${(metrics.maxDrawdown * 100).toFixed(1)}% within limit`
        : `Max drawdown ${(metrics.maxDrawdown * 100).toFixed(1)}% exceeds ${(thresholds.maxDrawdown * 100).toFixed(0)}% limit`,
  });

  // Gate: min Sharpe
  gates.push({
    name: "min_sharpe",
    passed: metrics.sharpe >= thresholds.minSharpe,
    actual: metrics.sharpe,
    threshold: thresholds.minSharpe,
    message:
      metrics.sharpe >= thresholds.minSharpe
        ? `Sharpe ${metrics.sharpe.toFixed(2)} meets minimum`
        : `Sharpe ${metrics.sharpe.toFixed(2)} below ${thresholds.minSharpe} minimum`,
  });

  // Gate: min trade count
  gates.push({
    name: "min_trade_count",
    passed: metrics.tradeCount >= thresholds.minTradeCount,
    actual: metrics.tradeCount,
    threshold: thresholds.minTradeCount,
    message:
      metrics.tradeCount >= thresholds.minTradeCount
        ? `${metrics.tradeCount} trades provides sufficient sample`
        : `Only ${metrics.tradeCount} trades (need ${thresholds.minTradeCount})`,
  });

  // Gate: min profit factor
  gates.push({
    name: "min_profit_factor",
    passed: metrics.profitFactor >= thresholds.minProfitFactor,
    actual: metrics.profitFactor,
    threshold: thresholds.minProfitFactor,
    message:
      metrics.profitFactor >= thresholds.minProfitFactor
        ? `Profit factor ${metrics.profitFactor.toFixed(2)} meets threshold`
        : `Profit factor ${metrics.profitFactor.toFixed(2)} below ${thresholds.minProfitFactor}`,
  });

  // Gate: min win rate
  gates.push({
    name: "min_win_rate",
    passed: metrics.winRate >= thresholds.minWinRate,
    actual: metrics.winRate,
    threshold: thresholds.minWinRate,
    message:
      metrics.winRate >= thresholds.minWinRate
        ? `Win rate ${(metrics.winRate * 100).toFixed(1)}% above threshold`
        : `Win rate ${(metrics.winRate * 100).toFixed(1)}% below ${(thresholds.minWinRate * 100).toFixed(0)}% threshold`,
  });

  return {
    passed: gates.every((g) => g.passed),
    gates,
  };
}
