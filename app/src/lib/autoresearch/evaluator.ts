// ---------------------------------------------------------------------------
// Strategy Evaluator — Lane B of the two-lane model
// ---------------------------------------------------------------------------
// Coordinates strategy evaluation via hyperspace autoquant, the Yahoo India
// equity backtest loop, and custom sandbox evaluation. Provides comparison
// utilities and regime-shift detection to support the autoresearch controller.
// ---------------------------------------------------------------------------

import type {
  EvaluationResult,
  ComparisonResult,
  RegimeIndicator,
  StrategyMetrics,
  HyperspaceConfig,
  IndiaConfig,
  CustomStrategyConfig,
  StrategyTemplate,
} from "./types";
import { INDIA_UNIVERSE, BENCHMARK, STRATEGY_TEMPLATES } from "./strategies";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default path for hyperspace autoquant state. */
const DEFAULT_STATE_FILE = "~/.hyperspace/autoquant/autoquant-state.json";

/** Minimum number of results needed for regime-shift detection. */
const MIN_REGIME_DETECTION_WINDOW = 3;

/** Composite scoring formula weights (mirrors yahoo_india_loop.py). */
const SCORE_WEIGHTS = {
  totalReturn: 1000,
  alpha: 200,
  sharpe: 10,
  sortino: 1,
  maxDrawdown: -1000,
} as const;

// ---------------------------------------------------------------------------
// StrategyEvaluator
// ---------------------------------------------------------------------------

export class StrategyEvaluator {
  /**
   * Evaluate a strategy using hyperspace autoquant in a sandbox.
   *
   * Invokes `hyperspace autoquant run -n <iterations> -v` and reads the
   * resulting metrics from the autoquant-state.json file. This matches the
   * approach in autoresearch/hyperspace_alpha/loop.py.
   *
   * In production this spawns a Modal sandbox; the method returns a
   * structured EvaluationResult regardless of the execution backend.
   */
  async evaluateWithHyperspace(
    config: HyperspaceConfig,
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Build the CLI command matching loop.py
    const args = ["hyperspace", "autoquant", "run"];
    args.push("-n", String(config.iterations));
    if (config.verbose) args.push("-v");

    const stateFile = config.stateFile || DEFAULT_STATE_FILE;

    // Execute in sandbox (implementation delegates to modal runner)
    const rawOutput = await this.executeInSandbox(args, config.timeout);

    // Parse the state file output
    const metrics = this.parseHyperspaceState(rawOutput, stateFile);
    const elapsed = Date.now() - startTime;

    return {
      strategyId: `hyperspace_${Date.now()}`,
      familyId: "",
      metrics,
      equity_curve: [], // populated from state file in production
      trades: metrics.winRate > 0 ? Math.round(100 * metrics.winRate) : 0,
      holdingPeriodDays: 0,
      evaluationTimeMs: elapsed,
      environment: "hyperspace",
      raw: rawOutput,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluate all (or a subset of) India equity strategies.
   *
   * Runs the 6 NSE strategy templates from yahoo_india_loop.py against the
   * INDIA_UNIVERSE with ^NSEI as benchmark. Each strategy is scored using
   * the composite formula.
   *
   * @param config - Configuration including universe, benchmark, date range,
   *   and optionally a subset of strategies to run.
   */
  async evaluateIndiaStrategies(
    config: IndiaConfig,
  ): Promise<EvaluationResult[]> {
    const universe = config.universe.length > 0 ? config.universe : INDIA_UNIVERSE;
    const benchmark = config.benchmark || BENCHMARK;
    const strategies = config.strategies.length > 0
      ? config.strategies
      : STRATEGY_TEMPLATES;

    const results: EvaluationResult[] = [];

    for (const strategy of strategies) {
      const startTime = Date.now();

      // Build the evaluation payload for this strategy
      const evalPayload = {
        strategy_name: strategy.name,
        universe,
        benchmark,
        lookback_months: strategy.lookbackMonths,
        top_k: strategy.topK,
        scorer: strategy.scorer,
        require_trend: strategy.requireTrend,
        breakout_window: strategy.breakoutWindow,
        rebalance_frequency: strategy.rebalanceFrequency,
        filters: strategy.additionalFilters,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
      };

      // Execute strategy evaluation in sandbox
      const rawOutput = await this.executeIndiaStrategy(evalPayload);
      const metrics = this.parseIndiaStrategyResult(rawOutput);
      const elapsed = Date.now() - startTime;

      results.push({
        strategyId: strategy.name,
        familyId: "",
        metrics,
        equity_curve: (rawOutput.equity_curve as EvaluationResult["equity_curve"]) ?? [],
        trades: (rawOutput.trades as number) ?? 0,
        holdingPeriodDays: (rawOutput.holding_period_days as number) ?? 0,
        evaluationTimeMs: elapsed,
        environment: "local_backtest",
        raw: rawOutput,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
  }

  /**
   * Evaluate arbitrary strategy code in a sandboxed environment.
   *
   * The code is injected into a sandbox container, executed with the
   * specified universe and date range, and the resulting metrics are
   * parsed and returned.
   */
  async evaluateCustomStrategy(
    code: string,
    config: CustomStrategyConfig,
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const rawOutput = await this.executeCustomCode(code, config);
    const metrics = this.parseCustomResult(rawOutput);
    const elapsed = Date.now() - startTime;

    return {
      strategyId: `custom_${Date.now()}`,
      familyId: "",
      metrics,
      equity_curve: (rawOutput.equity_curve as EvaluationResult["equity_curve"]) ?? [],
      trades: (rawOutput.trades as number) ?? 0,
      holdingPeriodDays: (rawOutput.holding_period_days as number) ?? 0,
      evaluationTimeMs: elapsed,
      environment: "local_backtest",
      raw: rawOutput,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compare an evaluation result against a baseline.
   *
   * Computes deltas for all metrics, determines if the result is an
   * improvement, and provides a keep/discard/needs_more_data recommendation.
   */
  compareToBaseline(
    result: EvaluationResult,
    baseline: EvaluationResult,
  ): ComparisonResult {
    const scoreDelta =
      result.metrics.compositeScore - baseline.metrics.compositeScore;

    const metricDeltas: Partial<Record<keyof StrategyMetrics, number>> = {
      totalReturn: result.metrics.totalReturn - baseline.metrics.totalReturn,
      alpha: result.metrics.alpha - baseline.metrics.alpha,
      sharpe: result.metrics.sharpe - baseline.metrics.sharpe,
      sortino: result.metrics.sortino - baseline.metrics.sortino,
      maxDrawdown: result.metrics.maxDrawdown - baseline.metrics.maxDrawdown,
      calmar: result.metrics.calmar - baseline.metrics.calmar,
      winRate: result.metrics.winRate - baseline.metrics.winRate,
      volatility: result.metrics.volatility - baseline.metrics.volatility,
      compositeScore: scoreDelta,
    };

    // Determine if this is a meaningful improvement
    const isImprovement = scoreDelta > 0;

    // Significance estimation: use a simple heuristic based on the magnitude
    // of improvement relative to the baseline score. A more rigorous approach
    // would use bootstrap resampling on the equity curves.
    const baselineAbs = Math.abs(baseline.metrics.compositeScore) || 1;
    const relativeChange = Math.abs(scoreDelta) / baselineAbs;
    const significanceLevel = Math.min(relativeChange * 5, 1.0);

    // Recommendation logic
    let recommendation: ComparisonResult["recommendation"];
    if (significanceLevel < 0.1) {
      recommendation = "needs_more_data";
    } else if (isImprovement) {
      recommendation = "keep";
    } else {
      recommendation = "discard";
    }

    return {
      strategyId: result.strategyId,
      baselineId: baseline.strategyId,
      scoreDelta,
      metricDeltas,
      isImprovement,
      significanceLevel,
      recommendation,
    };
  }

  /**
   * Detect if the market regime has shifted based on recent evaluation results.
   *
   * Compares metrics across a rolling window to identify changes in
   * volatility, correlation structure, momentum decay, and drawdown
   * acceleration. If a regime shift is detected, the autoresearch
   * controller should pause and reassess the search direction.
   *
   * @param results - Recent evaluation results, ordered chronologically.
   * @param windowMonths - The lookback window in months.
   */
  detectRegimeShift(
    results: EvaluationResult[],
    windowMonths: number,
  ): RegimeIndicator {
    // Need at least MIN_REGIME_DETECTION_WINDOW results
    if (results.length < MIN_REGIME_DETECTION_WINDOW) {
      return {
        detected: false,
        confidence: 0,
        previousRegime: "unknown",
        currentRegime: "unknown",
        metrics: {
          volatilityChange: 0,
          correlationShift: 0,
          momentumDecay: 0,
          drawdownAcceleration: 0,
        },
        recommendation: "continue",
      };
    }

    // Split results into two halves for comparison
    const midpoint = Math.floor(results.length / 2);
    const earlier = results.slice(0, midpoint);
    const recent = results.slice(midpoint);

    // Compute average metrics for each half
    const earlierAvg = averageMetrics(earlier);
    const recentAvg = averageMetrics(recent);

    // Volatility change: increase in max drawdown or portfolio volatility
    const volatilityChange =
      (recentAvg.volatility - earlierAvg.volatility) /
      (earlierAvg.volatility || 1);

    // Correlation shift: measured indirectly via alpha decay.
    // If alpha is collapsing while benchmark is flat, correlation is shifting.
    const correlationShift =
      earlierAvg.alpha !== 0
        ? (recentAvg.alpha - earlierAvg.alpha) / Math.abs(earlierAvg.alpha)
        : 0;

    // Momentum decay: Sharpe ratio degradation
    const momentumDecay =
      earlierAvg.sharpe !== 0
        ? (earlierAvg.sharpe - recentAvg.sharpe) / Math.abs(earlierAvg.sharpe)
        : 0;

    // Drawdown acceleration
    const drawdownAcceleration =
      (recentAvg.maxDrawdown - earlierAvg.maxDrawdown) /
      (earlierAvg.maxDrawdown || 0.01);

    // Overall regime shift score: weighted sum of indicators
    const shiftScore =
      Math.abs(volatilityChange) * 0.3 +
      Math.abs(correlationShift) * 0.2 +
      Math.abs(momentumDecay) * 0.3 +
      Math.abs(drawdownAcceleration) * 0.2;

    const detected = shiftScore > 0.25;
    const confidence = Math.min(shiftScore * 2, 1.0);

    // Classify regimes
    const classifyRegime = (avg: {
      volatility: number;
      sharpe: number;
      totalReturn: number;
    }): string => {
      if (avg.volatility > 0.25 && avg.sharpe < 0.5) return "high_volatility_bear";
      if (avg.volatility > 0.25 && avg.sharpe >= 0.5) return "high_volatility_bull";
      if (avg.volatility <= 0.25 && avg.totalReturn > 0.1) return "low_volatility_bull";
      if (avg.volatility <= 0.25 && avg.totalReturn <= 0) return "low_volatility_bear";
      return "transitional";
    };

    const previousRegime = classifyRegime(earlierAvg);
    const currentRegime = classifyRegime(recentAvg);

    // Recommendation
    let recommendation: RegimeIndicator["recommendation"];
    if (!detected) {
      recommendation = "continue";
    } else if (shiftScore > 0.6) {
      recommendation = "restart_search";
    } else {
      recommendation = "pause_and_reassess";
    }

    return {
      detected,
      confidence,
      previousRegime,
      currentRegime,
      metrics: {
        volatilityChange,
        correlationShift,
        momentumDecay,
        drawdownAcceleration,
      },
      recommendation,
    };
  }

  // -------------------------------------------------------------------------
  // Composite score calculation
  // -------------------------------------------------------------------------

  /**
   * Compute the composite score for a set of strategy metrics.
   * Formula: total_return * 1000 + alpha * 200 + sharpe * 10 + sortino - max_drawdown * 1000
   */
  static computeCompositeScore(metrics: StrategyMetrics): number {
    return (
      metrics.totalReturn * SCORE_WEIGHTS.totalReturn +
      metrics.alpha * SCORE_WEIGHTS.alpha +
      metrics.sharpe * SCORE_WEIGHTS.sharpe +
      metrics.sortino * SCORE_WEIGHTS.sortino +
      metrics.maxDrawdown * SCORE_WEIGHTS.maxDrawdown
    );
  }

  // -------------------------------------------------------------------------
  // Private: sandbox execution stubs
  // -------------------------------------------------------------------------
  // These methods are stubs that will be replaced by the actual Modal sandbox
  // runner integration. They define the interface boundary between the
  // evaluator and the execution layer.
  // -------------------------------------------------------------------------

  /** Execute a CLI command in a sandbox and return the parsed output. */
  private async executeInSandbox(
    args: string[],
    timeout: number,
  ): Promise<Record<string, unknown>> {
    // TODO: integrate with Modal sandbox runner (src/lib/modal/)
    // For now, return a placeholder that matches the expected shape.
    console.log(
      `[evaluator] would execute: ${args.join(" ")} (timeout: ${timeout}ms)`,
    );
    return {
      status: "pending_integration",
      command: args.join(" "),
      timeout,
    };
  }

  /** Execute an India strategy evaluation payload in a sandbox. */
  private async executeIndiaStrategy(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // TODO: integrate with Modal sandbox runner for yahoo_india_loop.py
    console.log(
      `[evaluator] would evaluate India strategy: ${payload.strategy_name}`,
    );
    return {
      status: "pending_integration",
      strategy_name: payload.strategy_name,
      equity_curve: [],
      trades: 0,
      holding_period_days: 0,
    };
  }

  /** Execute custom strategy code in a sandbox. */
  private async executeCustomCode(
    code: string,
    config: CustomStrategyConfig,
  ): Promise<Record<string, unknown>> {
    // TODO: integrate with Modal sandbox runner
    console.log(
      `[evaluator] would evaluate custom strategy in image: ${config.sandboxImage}`,
    );
    return {
      status: "pending_integration",
      code_length: code.length,
      equity_curve: [],
      trades: 0,
      holding_period_days: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private: result parsers
  // -------------------------------------------------------------------------

  /** Parse metrics from hyperspace autoquant-state.json output. */
  private parseHyperspaceState(
    raw: Record<string, unknown>,
    _stateFile: string,
  ): StrategyMetrics {
    // Extract metrics from raw output, falling back to zeros
    const get = (key: string): number => {
      const val = raw[key];
      return typeof val === "number" ? val : 0;
    };

    const metrics: StrategyMetrics = {
      totalReturn: get("total_return"),
      alpha: get("alpha"),
      sharpe: get("sharpe"),
      sortino: get("sortino"),
      maxDrawdown: get("max_drawdown"),
      calmar: get("calmar"),
      winRate: get("win_rate"),
      volatility: get("volatility"),
      benchmarkReturn: get("benchmark_return"),
      compositeScore: 0,
    };

    metrics.compositeScore = StrategyEvaluator.computeCompositeScore(metrics);
    return metrics;
  }

  /** Parse metrics from India strategy evaluation output. */
  private parseIndiaStrategyResult(
    raw: Record<string, unknown>,
  ): StrategyMetrics {
    const get = (key: string): number => {
      const val = raw[key];
      return typeof val === "number" ? val : 0;
    };

    const metrics: StrategyMetrics = {
      totalReturn: get("total_return"),
      alpha: get("alpha"),
      sharpe: get("sharpe"),
      sortino: get("sortino"),
      maxDrawdown: get("max_drawdown"),
      calmar: get("calmar"),
      winRate: get("win_rate"),
      volatility: get("volatility"),
      benchmarkReturn: get("benchmark_return"),
      compositeScore: 0,
    };

    metrics.compositeScore = StrategyEvaluator.computeCompositeScore(metrics);
    return metrics;
  }

  /** Parse metrics from custom strategy evaluation output. */
  private parseCustomResult(
    raw: Record<string, unknown>,
  ): StrategyMetrics {
    return this.parseIndiaStrategyResult(raw);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute average metrics across a set of evaluation results. */
function averageMetrics(results: EvaluationResult[]): {
  totalReturn: number;
  alpha: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  volatility: number;
} {
  const n = results.length || 1;

  const sum = results.reduce(
    (acc, r) => ({
      totalReturn: acc.totalReturn + r.metrics.totalReturn,
      alpha: acc.alpha + r.metrics.alpha,
      sharpe: acc.sharpe + r.metrics.sharpe,
      sortino: acc.sortino + r.metrics.sortino,
      maxDrawdown: acc.maxDrawdown + r.metrics.maxDrawdown,
      volatility: acc.volatility + r.metrics.volatility,
    }),
    {
      totalReturn: 0,
      alpha: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      volatility: 0,
    },
  );

  return {
    totalReturn: sum.totalReturn / n,
    alpha: sum.alpha / n,
    sharpe: sum.sharpe / n,
    sortino: sum.sortino / n,
    maxDrawdown: sum.maxDrawdown / n,
    volatility: sum.volatility / n,
  };
}
