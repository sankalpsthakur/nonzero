// ---------------------------------------------------------------------------
// Indian Equity Strategy Definitions
// ---------------------------------------------------------------------------
// Ported from autoresearch/hyperspace_alpha/yahoo_india_loop.py to TypeScript
// config. Contains the 20-stock NSE universe, benchmark, all 6 base strategy
// templates, and a mutation generator for creating strategy variants.
// ---------------------------------------------------------------------------

import type {
  StrategyTemplate,
  ScorerType,
  StrategyFilter,
  MutationType,
} from "./types";

// ---------------------------------------------------------------------------
// Universe & Benchmark
// ---------------------------------------------------------------------------

/** Top-20 NSE large-cap tickers used by the India strategy family. */
export const INDIA_UNIVERSE: string[] = [
  "RELIANCE.NS",
  "TCS.NS",
  "HDFCBANK.NS",
  "INFY.NS",
  "ICICIBANK.NS",
  "HINDUNILVR.NS",
  "ITC.NS",
  "SBIN.NS",
  "BHARTIARTL.NS",
  "KOTAKBANK.NS",
  "LT.NS",
  "AXISBANK.NS",
  "ASIANPAINT.NS",
  "MARUTI.NS",
  "TITAN.NS",
  "SUNPHARMA.NS",
  "ULTRACEMCO.NS",
  "NESTLEIND.NS",
  "WIPRO.NS",
  "POWERGRID.NS",
];

/** Nifty 50 benchmark for India strategies. */
export const BENCHMARK = "^NSEI";

// ---------------------------------------------------------------------------
// Strategy Templates
// ---------------------------------------------------------------------------

/**
 * The 6 base strategy templates from yahoo_india_loop.py.
 *
 * Each template defines a distinct approach to selecting and weighting
 * stocks from the INDIA_UNIVERSE. The autoresearch loop mutates these
 * templates to discover improved variants.
 */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  // 1. 12-month momentum, top 5
  {
    name: "india_momentum_12_top5",
    description:
      "Classic 12-month momentum: rank stocks by trailing 12-month return, " +
      "pick the top 5, equal-weight, rebalance monthly.",
    lookbackMonths: 12,
    topK: 5,
    scorer: "momentum",
    requireTrend: false,
    breakoutWindow: null,
    rebalanceFrequency: "monthly",
    additionalFilters: [],
  },

  // 2. 6-month momentum, top 8
  {
    name: "india_momentum_6_top8",
    description:
      "Mid-term momentum: rank by 6-month return, pick top 8, equal-weight, " +
      "rebalance monthly. Broader basket reduces concentration risk.",
    lookbackMonths: 6,
    topK: 8,
    scorer: "momentum",
    requireTrend: false,
    breakoutWindow: null,
    rebalanceFrequency: "monthly",
    additionalFilters: [],
  },

  // 3. Low-volatility, top 8
  {
    name: "india_low_vol_6_top8",
    description:
      "Low-volatility factor: rank by inverse 6-month realized volatility, " +
      "pick the 8 least volatile stocks, equal-weight, rebalance monthly.",
    lookbackMonths: 6,
    topK: 8,
    scorer: "low_volatility",
    requireTrend: false,
    breakoutWindow: null,
    rebalanceFrequency: "monthly",
    additionalFilters: [],
  },

  // 4. Momentum + low-vol combo
  {
    name: "india_momentum_lowvol_combo",
    description:
      "Blend: score = 0.5 * momentum_rank + 0.5 * low_vol_rank. " +
      "Top 8, equal-weight, rebalance monthly. Seeks quality momentum.",
    lookbackMonths: 6,
    topK: 8,
    scorer: "momentum_lowvol_combo",
    requireTrend: false,
    breakoutWindow: null,
    rebalanceFrequency: "monthly",
    additionalFilters: [],
  },

  // 5. Trend-filtered momentum
  {
    name: "india_trend_filtered_momentum",
    description:
      "Momentum with a 200-day SMA trend gate: only consider stocks trading " +
      "above their 200-day SMA. Rank survivors by 6-month return, top 8.",
    lookbackMonths: 6,
    topK: 8,
    scorer: "momentum",
    requireTrend: true,
    breakoutWindow: null,
    rebalanceFrequency: "monthly",
    additionalFilters: [
      {
        type: "trend",
        params: { sma_period: 200, require_above: true },
      },
    ],
  },

  // 6. Breakout confirmation
  {
    name: "india_breakout_confirmation",
    description:
      "Breakout: require price to be within 5% of 52-week high over a " +
      "20-day window. Rank survivors by 6-month momentum, top 8.",
    lookbackMonths: 6,
    topK: 8,
    scorer: "momentum",
    requireTrend: false,
    breakoutWindow: 20,
    rebalanceFrequency: "monthly",
    additionalFilters: [
      {
        type: "breakout_confirmation",
        params: {
          window_days: 20,
          high_period_days: 252,
          threshold_pct: 5,
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Strategy lookup helpers
// ---------------------------------------------------------------------------

/** Get a template by name, or undefined if not found. */
export function getTemplate(name: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.name === name);
}

/** Get all template names. */
export function getTemplateNames(): string[] {
  return STRATEGY_TEMPLATES.map((t) => t.name);
}

// ---------------------------------------------------------------------------
// Mutation generator
// ---------------------------------------------------------------------------

/** Parameter ranges used when generating random mutations. */
const PARAM_RANGES = {
  lookbackMonths: [3, 6, 9, 12, 18],
  topK: [3, 5, 8, 10, 12],
  breakoutWindows: [10, 15, 20, 30, 40],
  smaLengths: [50, 100, 150, 200],
  rebalanceFrequencies: ["monthly", "quarterly"] as const,
} as const;

/** All available scorer types for swapping. */
const ALL_SCORERS: ScorerType[] = [
  "momentum",
  "low_volatility",
  "momentum_lowvol_combo",
  "breakout",
  "mean_reversion",
  "quality",
  "value",
];

/**
 * Generate a mutated variant of a base strategy template.
 *
 * The mutation type determines which aspect of the strategy is changed:
 * - parameter_tweak: adjust lookback, topK, or rebalance frequency
 * - scorer_swap: replace the scoring function
 * - filter_add: add a trend or breakout filter
 * - filter_remove: strip one filter to reduce complexity
 * - universe_shift: (no-op here; handled by the controller)
 * - rebalance_change: change monthly <-> quarterly
 * - combination: blend the scorer to momentum_lowvol_combo
 * - regime_adaptive: add a trend filter as a regime gate
 * - risk_overlay: add a volatility-based filter
 */
export function generateMutatedStrategy(
  base: StrategyTemplate,
  mutation: MutationType,
): StrategyTemplate {
  // Deep clone so we don't mutate the original
  const mutated: StrategyTemplate = {
    ...base,
    additionalFilters: base.additionalFilters.map((f) => ({
      ...f,
      params: { ...f.params },
    })),
  };

  switch (mutation) {
    case "parameter_tweak": {
      // Randomly adjust lookback or topK to a neighbouring value
      const lookbackIdx = PARAM_RANGES.lookbackMonths.indexOf(
        base.lookbackMonths as (typeof PARAM_RANGES.lookbackMonths)[number],
      );
      const topKIdx = PARAM_RANGES.topK.indexOf(
        base.topK as (typeof PARAM_RANGES.topK)[number],
      );

      // Move lookback one step in a random direction
      if (lookbackIdx >= 0) {
        const newIdx = clamp(
          lookbackIdx + randomDirection(),
          0,
          PARAM_RANGES.lookbackMonths.length - 1,
        );
        mutated.lookbackMonths = PARAM_RANGES.lookbackMonths[newIdx];
      }

      // Move topK one step
      if (topKIdx >= 0) {
        const newIdx = clamp(
          topKIdx + randomDirection(),
          0,
          PARAM_RANGES.topK.length - 1,
        );
        mutated.topK = PARAM_RANGES.topK[newIdx];
      }

      mutated.name = `${base.name}_tweaked_lb${mutated.lookbackMonths}_k${mutated.topK}`;
      mutated.description = `Parameter-tweaked variant of ${base.name}: lookback=${mutated.lookbackMonths}m, topK=${mutated.topK}.`;
      break;
    }

    case "scorer_swap": {
      // Pick a different scorer
      const otherScorers = ALL_SCORERS.filter((s) => s !== base.scorer);
      const newScorer = otherScorers[Math.floor(Math.random() * otherScorers.length)];
      mutated.scorer = newScorer;
      mutated.name = `${base.name}_scorer_${newScorer}`;
      mutated.description = `Scorer-swapped variant of ${base.name}: using ${newScorer} instead of ${base.scorer}.`;
      break;
    }

    case "filter_add": {
      // Add a trend filter if not already present
      const hasTrend = mutated.additionalFilters.some((f) => f.type === "trend");
      if (!hasTrend) {
        const smaLength =
          PARAM_RANGES.smaLengths[
            Math.floor(Math.random() * PARAM_RANGES.smaLengths.length)
          ];
        const trendFilter: StrategyFilter = {
          type: "trend",
          params: { sma_period: smaLength, require_above: true },
        };
        mutated.additionalFilters.push(trendFilter);
        mutated.requireTrend = true;
        mutated.name = `${base.name}_trend_sma${smaLength}`;
        mutated.description = `${base.name} with added SMA(${smaLength}) trend filter.`;
      } else {
        // Add a volume filter instead
        const volFilter: StrategyFilter = {
          type: "volume",
          params: { min_avg_volume_20d: 1_000_000 },
        };
        mutated.additionalFilters.push(volFilter);
        mutated.name = `${base.name}_vol_filtered`;
        mutated.description = `${base.name} with added minimum volume filter.`;
      }
      break;
    }

    case "filter_remove": {
      if (mutated.additionalFilters.length > 0) {
        const removed = mutated.additionalFilters.pop()!;
        if (removed.type === "trend") {
          mutated.requireTrend = false;
        }
        if (removed.type === "breakout_confirmation") {
          mutated.breakoutWindow = null;
        }
        mutated.name = `${base.name}_stripped`;
        mutated.description = `${base.name} with ${removed.type} filter removed for simplicity.`;
      } else {
        // Nothing to remove; just rename
        mutated.name = `${base.name}_minimal`;
        mutated.description = `${base.name} (already minimal, no filters to remove).`;
      }
      break;
    }

    case "universe_shift": {
      // Universe changes are handled at the controller level (different tickers).
      // Here we just annotate the template.
      mutated.name = `${base.name}_universe_shifted`;
      mutated.description = `${base.name} flagged for universe shift (applied externally).`;
      break;
    }

    case "rebalance_change": {
      mutated.rebalanceFrequency =
        base.rebalanceFrequency === "monthly" ? "quarterly" : "monthly";
      mutated.name = `${base.name}_rebal_${mutated.rebalanceFrequency}`;
      mutated.description = `${base.name} with rebalance frequency changed to ${mutated.rebalanceFrequency}.`;
      break;
    }

    case "combination": {
      // Blend the current scorer with momentum_lowvol_combo
      if (base.scorer !== "momentum_lowvol_combo") {
        mutated.scorer = "momentum_lowvol_combo";
        mutated.name = `${base.name}_combo`;
        mutated.description = `${base.name} blended into momentum + low-vol combo scorer.`;
      } else {
        // Already a combo; switch to pure momentum as a different blend
        mutated.scorer = "momentum";
        mutated.name = `${base.name}_pure_mom`;
        mutated.description = `${base.name} decomposed from combo back to pure momentum.`;
      }
      break;
    }

    case "regime_adaptive": {
      // Add a trend filter as a regime-conditional gate
      const sma = 200;
      const hasTrendFilter = mutated.additionalFilters.some(
        (f) => f.type === "trend",
      );
      if (!hasTrendFilter) {
        mutated.additionalFilters.push({
          type: "trend",
          params: { sma_period: sma, require_above: true, regime_gate: true },
        });
        mutated.requireTrend = true;
      }
      mutated.name = `${base.name}_regime_adaptive`;
      mutated.description = `${base.name} with regime-adaptive SMA(${sma}) gate. Exits to cash in downtrends.`;
      break;
    }

    case "risk_overlay": {
      // Add a volatility filter to cap risk
      const hasVolFilter = mutated.additionalFilters.some(
        (f) => f.type === "volatility",
      );
      if (!hasVolFilter) {
        mutated.additionalFilters.push({
          type: "volatility",
          params: {
            max_annualized_vol: 0.30,
            lookback_days: 60,
          },
        });
      }
      mutated.name = `${base.name}_risk_capped`;
      mutated.description = `${base.name} with volatility risk overlay (max 30% annualized vol).`;
      break;
    }
  }

  return mutated;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomDirection(): -1 | 0 | 1 {
  const r = Math.random();
  if (r < 0.33) return -1;
  if (r < 0.66) return 1;
  return 0;
}
