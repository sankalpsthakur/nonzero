"use client";

import {
  FlaskConical, Plus, Filter, Calendar, Search,
  TrendingUp, ArrowUpRight, Clock, Beaker, ChevronRight
} from "lucide-react";

const families = [
  { id: 1, name: "Momentum", count: 12, active: true },
  { id: 2, name: "Mean Reversion", count: 8, active: false },
  { id: 3, name: "Breakout", count: 6, active: false },
  { id: 4, name: "Pairs Trading", count: 4, active: false },
  { id: 5, name: "Volatility", count: 5, active: false },
  { id: 6, name: "Sector Rotation", count: 3, active: false },
  { id: 7, name: "Event Driven", count: 2, active: false },
  { id: 8, name: "Options", count: 7, active: false },
];

const experiments = [
  {
    id: "exp-001", name: "Momentum Alpha v4", family: "Momentum",
    hypothesis: "Combining RSI divergence with volume breakouts on NIFTY50 stocks yields higher alpha in trending markets.",
    bestReturn: 34.2, bestAlpha: 12.8, bestSharpe: 2.41, runs: 24,
    lastRun: "2 hours ago", status: "RUNNING",
  },
  {
    id: "exp-002", name: "Mean Reversion Intraday", family: "Mean Reversion",
    hypothesis: "Bollinger band mean reversion on liquid F&O stocks with 5-min timeframe captures consistent small gains.",
    bestReturn: 28.7, bestAlpha: 10.1, bestSharpe: 2.18, runs: 18,
    lastRun: "5 hours ago", status: "COMPLETED",
  },
  {
    id: "exp-003", name: "Breakout Hunter v3", family: "Breakout",
    hypothesis: "Multi-timeframe breakout confirmation reduces false signals by 40% compared to single-timeframe approach.",
    bestReturn: 26.4, bestAlpha: 9.5, bestSharpe: 1.94, runs: 31,
    lastRun: "1 day ago", status: "COMPLETED",
  },
  {
    id: "exp-004", name: "Vol Crush Strategy", family: "Volatility",
    hypothesis: "Short straddles on high IV rank stocks with delta hedging generates consistent theta decay income.",
    bestReturn: 19.8, bestAlpha: 6.9, bestSharpe: 1.76, runs: 15,
    lastRun: "3 hours ago", status: "RUNNING",
  },
  {
    id: "exp-005", name: "Pair NIFTY-BANKNIFTY", family: "Pairs Trading",
    hypothesis: "NIFTY-BANKNIFTY spread reverts to mean within 3 days with 85% probability when z-score > 2.",
    bestReturn: 22.1, bestAlpha: 7.3, bestSharpe: 1.87, runs: 12,
    lastRun: "6 hours ago", status: "FAILED",
  },
  {
    id: "exp-006", name: "Sector Rotation Q4", family: "Sector Rotation",
    hypothesis: "Monthly rebalancing into top 3 sectors by relative strength outperforms equal-weight portfolio.",
    bestReturn: 18.3, bestAlpha: 5.2, bestSharpe: 1.65, runs: 8,
    lastRun: "2 days ago", status: "COMPLETED",
  },
  {
    id: "exp-007", name: "Event Catalyst v2", family: "Event Driven",
    hypothesis: "Pre-earnings momentum combined with post-earnings drift captures 60% of earnings move.",
    bestReturn: 13.8, bestAlpha: 3.6, bestSharpe: 1.31, runs: 6,
    lastRun: "4 days ago", status: "DRAFT",
  },
  {
    id: "exp-008", name: "Options Gamma Scalp", family: "Options",
    hypothesis: "Gamma scalping near expiry on high-OI strikes generates positive PnL from realized vol > implied.",
    bestReturn: 15.2, bestAlpha: 4.1, bestSharpe: 1.43, runs: 20,
    lastRun: "1 hour ago", status: "RUNNING",
  },
];

const statusColor: Record<string, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400",
  COMPLETED: "bg-blue-500/20 text-blue-400",
  FAILED: "bg-red-500/20 text-red-400",
  DRAFT: "bg-zinc-500/20 text-zinc-400",
};

export default function ResearchPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-blue-400" />
            Research Lab
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Discover, hypothesize, and validate trading strategies</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Experiment
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-[#111118] border border-[#1e1e2e] rounded-xl p-3">
        <div className="flex items-center gap-2 flex-1 bg-[#0a0a0f] rounded-lg px-3 py-2 border border-[#1e1e2e]">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search experiments..."
            className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a]">
          <Filter className="w-3.5 h-3.5" /> Family
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a]">
          <Beaker className="w-3.5 h-3.5" /> Environment
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a]">
          <Calendar className="w-3.5 h-3.5" /> Date Range
        </button>
      </div>

      <div className="flex gap-6">
        {/* Family Sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Strategy Families</h3>
            <div className="space-y-1">
              {families.map((f) => (
                <button
                  key={f.id}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    f.active ? "bg-blue-500/10 text-blue-400" : "text-zinc-400 hover:bg-[#1e1e2e]/50 hover:text-zinc-300"
                  }`}
                >
                  <span>{f.name}</span>
                  <span className="text-[10px] bg-[#1e1e2e] px-1.5 py-0.5 rounded-full text-zinc-500">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Experiment Cards Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {experiments.map((exp) => (
            <div key={exp.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3a] transition-all group cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-blue-400 transition-colors">{exp.name}</h3>
                  <span className="text-[10px] text-zinc-500 font-mono">{exp.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[exp.status]}`}>
                    {exp.status === "RUNNING" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />}
                    {exp.status}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4 line-clamp-2 leading-relaxed">{exp.hypothesis}</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#0a0a0f] rounded-lg p-2 text-center">
                  <p className="text-xs text-emerald-400 font-mono font-bold">+{exp.bestReturn}%</p>
                  <p className="text-[10px] text-zinc-500">Return</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-2 text-center">
                  <p className="text-xs text-blue-400 font-mono font-bold">+{exp.bestAlpha}%</p>
                  <p className="text-[10px] text-zinc-500">Alpha</p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-2 text-center">
                  <p className="text-xs text-white font-mono font-bold">{exp.bestSharpe}</p>
                  <p className="text-[10px] text-zinc-500">Sharpe</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <Beaker className="w-3 h-3" /> {exp.runs} runs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {exp.lastRun}
                </span>
                <span className="text-zinc-600">{exp.family}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
