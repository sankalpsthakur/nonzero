"use client";

import {
  FolderTree, Plus, TrendingUp, Beaker, Activity,
  Clock, ChevronRight, Target
} from "lucide-react";

const families = [
  {
    id: "fam-001", name: "Momentum", slug: "momentum",
    description: "Strategies that exploit price momentum across timeframes. Includes trend following, breakout, and relative strength approaches.",
    objective: "Generate alpha from persistent price trends with Sharpe > 2.0",
    benchmark: "NIFTY 50", versions: 6, latestVersion: "v4",
    latestStatus: "RUNNING", experiments: 12, bestReturn: 34.2, bestSharpe: 2.41,
  },
  {
    id: "fam-002", name: "Mean Reversion", slug: "mean-reversion",
    description: "Strategies based on price mean reversion. Includes Bollinger band, z-score, and cointegration-based approaches.",
    objective: "Capture consistent returns from mean-reverting price behavior",
    benchmark: "NIFTY 50", versions: 3, latestVersion: "v2",
    latestStatus: "COMPLETED", experiments: 8, bestReturn: 28.7, bestSharpe: 2.18,
  },
  {
    id: "fam-003", name: "Breakout", slug: "breakout",
    description: "Multi-timeframe breakout strategies using volume, ATR, and OBV confirmation signals.",
    objective: "Identify and exploit genuine breakouts while minimizing false signals",
    benchmark: "NIFTY 50", versions: 3, latestVersion: "v3",
    latestStatus: "COMPLETED", experiments: 6, bestReturn: 26.4, bestSharpe: 1.94,
  },
  {
    id: "fam-004", name: "Pairs Trading", slug: "pairs-trading",
    description: "Statistical arbitrage strategies based on cointegrated pairs. NIFTY-BANKNIFTY spread and sector pairs.",
    objective: "Market-neutral returns from spread mean reversion",
    benchmark: "Risk-free rate", versions: 2, latestVersion: "v1",
    latestStatus: "FAILED", experiments: 4, bestReturn: 22.1, bestSharpe: 1.87,
  },
  {
    id: "fam-005", name: "Volatility", slug: "volatility",
    description: "Options-based strategies exploiting volatility mispricing. Includes straddles, strangles, and dispersion trades.",
    objective: "Theta decay income with controlled tail risk",
    benchmark: "NIFTY VIX", versions: 2, latestVersion: "v2",
    latestStatus: "RUNNING", experiments: 5, bestReturn: 19.8, bestSharpe: 1.76,
  },
  {
    id: "fam-006", name: "Sector Rotation", slug: "sector-rotation",
    description: "Monthly rebalancing into top-performing sectors based on relative strength and fundamental factors.",
    objective: "Outperform equal-weight sector portfolio by 5% annually",
    benchmark: "NIFTY 50", versions: 4, latestVersion: "v4",
    latestStatus: "COMPLETED", experiments: 3, bestReturn: 18.3, bestSharpe: 1.65,
  },
  {
    id: "fam-007", name: "Event Driven", slug: "event-driven",
    description: "Strategies around corporate events, earnings announcements, and macro catalysts.",
    objective: "Capture event-driven alpha with asymmetric payoff profiles",
    benchmark: "NIFTY 50", versions: 2, latestVersion: "v2",
    latestStatus: "DRAFT", experiments: 2, bestReturn: 13.8, bestSharpe: 1.31,
  },
  {
    id: "fam-008", name: "Options", slug: "options",
    description: "Pure options strategies including gamma scalping, iron condors, and systematic selling approaches.",
    objective: "Consistent income from options premium with risk controls",
    benchmark: "Risk-free rate", versions: 3, latestVersion: "v1",
    latestStatus: "RUNNING", experiments: 7, bestReturn: 15.2, bestSharpe: 1.43,
  },
];

const statusColor: Record<string, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400",
  COMPLETED: "bg-blue-500/20 text-blue-400",
  FAILED: "bg-red-500/20 text-red-400",
  DRAFT: "bg-zinc-500/20 text-zinc-400",
};

export default function FamiliesPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-blue-400" />
            Strategy Families
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Registry of strategy families and their evolution</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Create Family
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold">{families.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Total Families</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold">{families.reduce((s, f) => s + f.experiments, 0)}</p>
          <p className="text-xs text-zinc-500 mt-1">Total Experiments</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-400">{families.reduce((s, f) => s + f.versions, 0)}</p>
          <p className="text-xs text-zinc-500 mt-1">Total Versions</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold text-purple-400">{Math.max(...families.map(f => f.bestSharpe)).toFixed(2)}</p>
          <p className="text-xs text-zinc-500 mt-1">Best Sharpe</p>
        </div>
      </div>

      {/* Family Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {families.map((fam) => (
          <div key={fam.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3a] transition-all group cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold group-hover:text-blue-400 transition-colors">{fam.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[fam.latestStatus]}`}>{fam.latestStatus}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">{fam.slug} &middot; {fam.id}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
            </div>

            <p className="text-xs text-zinc-400 mb-3 line-clamp-2 leading-relaxed">{fam.description}</p>

            <div className="bg-[#0a0a0f] rounded-lg p-3 mb-3 border border-[#1e1e2e]">
              <p className="text-[10px] text-zinc-500 mb-1">Objective</p>
              <p className="text-xs text-zinc-300">{fam.objective}</p>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="text-center">
                <p className="text-xs font-bold font-mono text-emerald-400">+{fam.bestReturn}%</p>
                <p className="text-[10px] text-zinc-500">Best Return</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold font-mono text-purple-400">{fam.bestSharpe}</p>
                <p className="text-[10px] text-zinc-500">Best Sharpe</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold font-mono">{fam.versions}</p>
                <p className="text-[10px] text-zinc-500">Versions</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold font-mono">{fam.experiments}</p>
                <p className="text-[10px] text-zinc-500">Experiments</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-3 border-t border-[#1e1e2e]">
              <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Benchmark: {fam.benchmark}</span>
              <span>Latest: {fam.latestVersion}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
