"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Play, Search, ChevronDown, ChevronRight, Terminal,
  Clock, Activity, Cpu, StopCircle, RotateCcw, Copy,
  CheckCircle, XCircle, Pause, Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data — 12 runs
// ---------------------------------------------------------------------------

const runs = [
  { id: "RUN-A7X", sandbox: "sb-frontier-001", experiment: "Momentum Alpha v4", hypothesis: "RSI divergence + volume breakouts on NIFTY50 stocks", status: "RUNNING", elapsed: "2h 34m", step: "Walk-forward #3 of 5", progress: 78, env: "Research", family: "Momentum", heartbeat: true },
  { id: "RUN-B3K", sandbox: "sb-robustness-012", experiment: "Mean Reversion Pro", hypothesis: "Bollinger band reversion on liquid F&O stocks with adaptive bandwidth", status: "RUNNING", elapsed: "1h 12m", step: "Monte Carlo simulation (1500/5000)", progress: 45, env: "Research", family: "Mean Reversion", heartbeat: true },
  { id: "RUN-C9P", sandbox: "sb-divergence-007", experiment: "Breakout Hunter v3", hypothesis: "Multi-timeframe breakout confirmation using ATR expansion", status: "RUNNING", elapsed: "4h 01m", step: "Final validation pass", progress: 92, env: "Paper", family: "Breakout", heartbeat: true },
  { id: "RUN-D2M", sandbox: "sb-frontier-002", experiment: "Vol Crush v2", hypothesis: "Short straddles with delta hedging on high IV rank", status: "RUNNING", elapsed: "0h 18m", step: "Data ingestion (NIFTY50 constituents)", progress: 15, env: "Research", family: "Volatility", heartbeat: true },
  { id: "RUN-E5N", sandbox: "sb-shadow-003", experiment: "Sector Rotation v5", hypothesis: "Monthly rebalancing into top 3 relative strength sectors", status: "RUNNING", elapsed: "1h 55m", step: "Backtest epoch 7/12", progress: 61, env: "Shadow-Live", family: "Sector Rotation", heartbeat: true },
  { id: "RUN-F1Q", sandbox: "sb-paper-001", experiment: "Pair NIFTY-BANKNIFTY", hypothesis: "Cointegrated spread mean reversion with dynamic thresholds", status: "COMPLETED", elapsed: "3h 42m", step: "Complete", progress: 100, env: "Paper", family: "Pairs Trading", heartbeat: false },
  { id: "RUN-G8R", sandbox: "sb-paper-002", experiment: "Options Gamma Scalp", hypothesis: "Gamma scalping near expiry on high-OI strikes", status: "FAILED", elapsed: "0h 45m", step: "Error: Insufficient data for BANKNIFTY weekly options", progress: 32, env: "Paper", family: "Options", heartbeat: false },
  { id: "RUN-H4S", sandbox: "sb-shadow-001", experiment: "Trend Following v6", hypothesis: "Dual MA crossover + ATR-based adaptive stops", status: "COMPLETED", elapsed: "5h 15m", step: "Complete", progress: 100, env: "Shadow-Live", family: "Momentum", heartbeat: false },
  { id: "RUN-I2T", sandbox: "sb-live-001", experiment: "Cross-Sec Mom v2", hypothesis: "Long top decile / short bottom decile on 12-1 month momentum", status: "RUNNING", elapsed: "6h 22m", step: "Live execution — holding 23 positions", progress: 100, env: "Live", family: "Momentum", heartbeat: true },
  { id: "RUN-J6U", sandbox: "sb-frontier-005", experiment: "Gap Fill Reversal", hypothesis: "Opening gap fill intraday reversion targets", status: "RUNNING", elapsed: "0h 52m", step: "Feature engineering (42/60 features)", progress: 28, env: "Research", family: "Mean Reversion", heartbeat: true },
  { id: "RUN-K3V", sandbox: "sb-paper-003", experiment: "Iron Condor Weekly", hypothesis: "Weekly iron condors on NIFTY with POP > 70%", status: "FAILED", elapsed: "1h 03m", step: "Error: Margin exceeded for position sizing", progress: 55, env: "Paper", family: "Options", heartbeat: false },
  { id: "RUN-L9W", sandbox: "sb-frontier-006", experiment: "Dispersion Alpha v1", hypothesis: "Index vs single-stock vol dispersion trading", status: "COMPLETED", elapsed: "2h 48m", step: "Complete", progress: 100, env: "Research", family: "Volatility", heartbeat: false },
];

const environments = ["Research", "Paper", "Shadow-Live", "Live"] as const;
const statusList = ["RUNNING", "COMPLETED", "FAILED"] as const;

const statusStyles: Record<string, { bg: string; text: string; dot: boolean }> = {
  RUNNING: { bg: "bg-emerald-500/20", text: "text-emerald-400", dot: true },
  COMPLETED: { bg: "bg-blue-500/20", text: "text-blue-400", dot: false },
  FAILED: { bg: "bg-red-500/20", text: "text-red-400", dot: false },
};

const envStyles: Record<string, string> = {
  Research: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  Paper: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "Shadow-Live": "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  Live: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

const logsByRun: Record<string, string[]> = {
  "RUN-A7X": [
    "[09:14:32] INFO  Starting walk-forward optimization pass #3",
    "[09:14:33] INFO  Loading historical data: NIFTY50 constituents 2020-2026",
    "[09:14:35] DEBUG Data loaded: 45,230 bars across 50 instruments",
    "[09:14:36] INFO  Training window: 2020-01-01 to 2024-06-30",
    "[09:14:37] INFO  Test window: 2024-07-01 to 2025-12-31",
    "[09:15:01] METRIC epoch=7 train_sharpe=2.31 test_sharpe=2.18 alpha=11.4%",
    "[09:15:02] INFO  Parameter optimization: RSI_period=14, vol_lookback=20",
    "[09:15:45] METRIC epoch=8 train_sharpe=2.42 test_sharpe=2.28 alpha=12.1%",
    "[09:16:12] HEARTBEAT sandbox=sb-frontier-001 cpu=34% mem=2.1GB",
    "[09:16:30] INFO  Walk-forward pass #3 complete. Best sharpe: 2.41",
  ],
  "RUN-G8R": [
    "[10:15:00] INFO  Starting gamma scalp backtest",
    "[10:15:02] INFO  Loading BANKNIFTY weekly options chain 2024-2026",
    "[10:15:05] WARN  Missing data: BANKNIFTY 28-Mar-2025 weekly expiry",
    "[10:15:06] WARN  Missing data: BANKNIFTY 04-Apr-2025 weekly expiry",
    "[10:15:08] ERROR Insufficient data for BANKNIFTY weekly options — need 90% coverage, got 71%",
    "[10:15:08] ERROR Run terminated with exit code 1",
  ],
};

const defaultLogs = [
  "[10:00:00] INFO  Run initialized. Loading configuration...",
  "[10:00:02] INFO  Sandbox environment ready. Starting execution.",
  "[10:00:05] INFO  Data pipeline connected. Streaming market data.",
  "[10:00:10] METRIC step=1 metrics_computed=true latency_ms=42",
  "[10:00:15] HEARTBEAT cpu=22% mem=1.2GB disk=8%",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RunsPage() {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeEnvs, setActiveEnvs] = useState<Set<string>>(new Set(environments));
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set(statusList));

  const toggleEnv = (env: string) => {
    setActiveEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(env)) next.delete(env);
      else next.add(env);
      return next;
    });
  };

  const toggleStatus = (status: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const filtered = runs.filter((r) => {
    if (!activeEnvs.has(r.env)) return false;
    if (!activeStatuses.has(r.status)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.experiment.toLowerCase().includes(q) ||
        r.sandbox.toLowerCase().includes(q) ||
        r.hypothesis.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const runningCount = runs.filter((r) => r.status === "RUNNING").length;
  const completedToday = runs.filter((r) => r.status === "COMPLETED").length;
  const failedToday = runs.filter((r) => r.status === "FAILED").length;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Play className="w-6 h-6 text-blue-400" />
            Run Fleet
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Modal sandbox control surface &mdash; monitor and manage all active runs</p>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">{runningCount}</p>
            <p className="text-[11px] text-zinc-500">Total Running</p>
          </div>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">{completedToday}</p>
            <p className="text-[11px] text-zinc-500">Completed Today</p>
          </div>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{failedToday}</p>
            <p className="text-[11px] text-zinc-500">Failed Today</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[260px] bg-[#111118] rounded-lg px-3 py-2.5 border border-[#1e1e2e] focus-within:border-[#3b82f6]/50 transition-colors">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search runs by sandbox, experiment, or ID..."
            className="bg-transparent text-sm text-white placeholder-zinc-600 outline-none flex-1"
          />
        </div>

        {/* Environment toggles */}
        <div className="flex items-center gap-1.5">
          {environments.map((env) => (
            <button
              key={env}
              onClick={() => toggleEnv(env)}
              className={`px-3 py-2 text-[11px] font-medium rounded-lg border transition-colors ${
                activeEnvs.has(env)
                  ? envStyles[env]
                  : "bg-[#111118] text-zinc-600 border-[#1e1e2e]"
              }`}
            >
              {env}
            </button>
          ))}
        </div>

        {/* Status toggles */}
        <div className="flex items-center gap-1.5">
          {statusList.map((st) => {
            const s = statusStyles[st];
            return (
              <button
                key={st}
                onClick={() => toggleStatus(st)}
                className={`px-3 py-2 text-[11px] font-medium rounded-lg border transition-colors ${
                  activeStatuses.has(st)
                    ? `${s.bg} ${s.text} border-transparent`
                    : "bg-[#111118] text-zinc-600 border-[#1e1e2e]"
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      {/* Run Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-zinc-500">
            No runs match your filters.
          </div>
        )}
        {filtered.map((run) => {
          const s = statusStyles[run.status];
          const isExpanded = expandedRun === run.id;
          const logs = logsByRun[run.id] ?? defaultLogs;

          return (
            <div key={run.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden hover:border-[#2a2a3a] transition-colors">
              <div className="p-4">
                {/* Top row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${s.bg} ${s.text}`}>
                      {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                      {run.status}
                    </span>
                    <span className="text-xs font-mono text-zinc-600">{run.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${envStyles[run.env]}`}>{run.env}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.heartbeat && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        alive
                      </span>
                    )}
                    <Link href={`/runs/${run.id}`} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
                      Details <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {/* Title + hypothesis */}
                <h3 className="text-sm font-semibold mb-0.5">{run.experiment}</h3>
                <p className="text-[11px] text-zinc-500 mb-3 truncate">{run.hypothesis}</p>

                {/* Sandbox + elapsed */}
                <div className="flex items-center gap-4 text-[11px] text-zinc-500 mb-3">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {run.sandbox}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {run.elapsed}</span>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="w-full bg-[#1e1e2e] rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          run.status === "FAILED" ? "bg-red-500" :
                          run.status === "COMPLETED" ? "bg-blue-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${run.progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 w-10 text-right">{run.progress}%</span>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 truncate">{run.step}</p>

                {/* Quick Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1e1e2e]/50">
                  {run.status === "RUNNING" && (
                    <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors">
                      <StopCircle className="w-3 h-3" /> Terminate
                    </button>
                  )}
                  {run.status === "FAILED" && (
                    <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md hover:bg-amber-500/20 transition-colors">
                      <RotateCcw className="w-3 h-3" /> Retry
                    </button>
                  )}
                  <button className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 bg-[#1e1e2e] rounded-md hover:bg-[#2a2a3a] transition-colors">
                    <Copy className="w-3 h-3" /> Clone
                  </button>
                </div>
              </div>

              {/* Expandable Log Viewer */}
              <div className="border-t border-[#1e1e2e]">
                <button
                  onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-400 hover:bg-[#16161f] transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  {isExpanded ? "Hide" : "Show"} Logs
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-[10px] leading-relaxed max-h-44 overflow-y-auto border border-[#1e1e2e]">
                      {logs.map((line, i) => (
                        <div key={i} className={`${
                          line.includes("ERROR") ? "text-red-400" :
                          line.includes("WARN") ? "text-amber-400" :
                          line.includes("METRIC") ? "text-emerald-400" :
                          line.includes("HEARTBEAT") ? "text-blue-400" :
                          line.includes("DEBUG") ? "text-zinc-600" :
                          "text-zinc-400"
                        }`}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
