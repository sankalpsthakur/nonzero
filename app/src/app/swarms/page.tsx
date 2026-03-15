"use client";

import { useState } from "react";
import {
  Network, Play, Pause, Copy, SlidersHorizontal, Activity,
  Cpu, Coins, Trophy, AlertTriangle, Target, Zap,
  Compass, ShieldCheck, GitBranch, ChevronRight, Hash,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock — 3 active swarms
// ---------------------------------------------------------------------------

const swarms = [
  {
    id: "SWM-001", name: "Frontier Explorer Alpha", template: "Frontier Explorer",
    family: "Momentum", status: "RUNNING",
    children: { completed: 5, total: 8, running: 3, failed: 0 },
    creditReserved: 4500, creditUsed: 2800,
    bestScore: 2.41, failureRate: 0,
    created: "2 hours ago",
  },
  {
    id: "SWM-002", name: "Robustness Audit Mean Rev", template: "Robustness Auditor",
    family: "Mean Reversion", status: "RUNNING",
    children: { completed: 2, total: 5, running: 2, failed: 1 },
    creditReserved: 2500, creditUsed: 1200,
    bestScore: 2.18, failureRate: 20,
    created: "5 hours ago",
  },
  {
    id: "SWM-003", name: "Divergence Probe Breakout", template: "Divergence Investigator",
    family: "Breakout", status: "PAUSED",
    children: { completed: 4, total: 6, running: 0, failed: 2 },
    creditReserved: 3000, creditUsed: 2100,
    bestScore: 1.94, failureRate: 33,
    created: "1 day ago",
  },
];

const templates = [
  {
    name: "Frontier Explorer",
    icon: Compass,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    description: "Explores novel strategy mutations at the frontier of the parameter space. Spawns diverse children with high variance to discover new alpha sources.",
    defaults: { maxChildren: 8, creditCap: 5000, mutationRate: "High", timeout: "6h" },
  },
  {
    name: "Robustness Auditor",
    icon: ShieldCheck,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Stress-tests existing strategies across regime changes, Monte Carlo scenarios, and slippage assumptions. Validates production readiness.",
    defaults: { maxChildren: 5, creditCap: 3000, mutationRate: "Low", timeout: "4h" },
  },
  {
    name: "Divergence Investigator",
    icon: GitBranch,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    description: "Investigates why train and validation metrics diverge. Searches for overfitting sources, data leakage, and regime sensitivity.",
    defaults: { maxChildren: 6, creditCap: 3500, mutationRate: "Medium", timeout: "5h" },
  },
];

const statusStyles: Record<string, { bg: string; text: string; dot: boolean; border: string }> = {
  RUNNING: { bg: "bg-emerald-500/20", text: "text-emerald-400", dot: true, border: "border-emerald-500/20" },
  PAUSED: { bg: "bg-amber-500/20", text: "text-amber-400", dot: false, border: "border-amber-500/20" },
  COMPLETED: { bg: "bg-blue-500/20", text: "text-blue-400", dot: false, border: "border-blue-500/20" },
};

const templateBadge: Record<string, string> = {
  "Frontier Explorer": "bg-purple-500/15 text-purple-400",
  "Robustness Auditor": "bg-cyan-500/15 text-cyan-400",
  "Divergence Investigator": "bg-amber-500/15 text-amber-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SwarmsPage() {
  const [concurrencyInputs, setConcurrencyInputs] = useState<Record<string, string>>({});

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-400" />
            Swarm Orchestration
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Manage autonomous strategy exploration swarms</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {swarms.filter((s) => s.status === "RUNNING").length} active
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">{swarms.reduce((n, s) => n + s.children.running, 0)} sandboxes running</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Swarms", value: swarms.length.toString(), icon: Network, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Active Sandboxes", value: swarms.reduce((n, s) => n + s.children.running, 0).toString(), icon: Cpu, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Credits Reserved", value: swarms.reduce((n, s) => n + s.creditReserved, 0).toLocaleString(), icon: Coins, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Best Score (Sharpe)", value: Math.max(...swarms.map((s) => s.bestScore)).toFixed(2), icon: Trophy, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Active Swarm Cards */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Active Swarms</h2>
        <div className="space-y-4">
          {swarms.map((swarm) => {
            const st = statusStyles[swarm.status];
            const childProgress = swarm.children.total > 0 ? Math.round((swarm.children.completed / swarm.children.total) * 100) : 0;
            const creditPct = swarm.creditReserved > 0 ? Math.round((swarm.creditUsed / swarm.creditReserved) * 100) : 0;
            const concurrency = concurrencyInputs[swarm.id] ?? "";

            return (
              <div key={swarm.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden hover:border-[#2a2a3a] transition-colors">
                <div className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-base font-semibold">{swarm.name}</h3>
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border ${st.bg} ${st.text} ${st.border}`}>
                          {st.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                          {swarm.status}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${templateBadge[swarm.template]}`}>{swarm.template}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="font-mono">{swarm.id}</span>
                        <span>Family: <span className="text-zinc-400">{swarm.family}</span></span>
                        <span>Created {swarm.created}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {swarm.status === "RUNNING" && (
                        <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors">
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      )}
                      {swarm.status === "PAUSED" && (
                        <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors">
                          <Play className="w-3.5 h-3.5" /> Resume
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={12}
                          placeholder="Cap"
                          value={concurrency}
                          onChange={(e) => setConcurrencyInputs((prev) => ({ ...prev, [swarm.id]: e.target.value }))}
                          className="w-14 px-2 py-2 text-xs text-white bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg outline-none focus:border-[#3b82f6]/50 font-mono text-center"
                        />
                        <button className="flex items-center gap-1 px-2.5 py-2 text-xs text-zinc-400 bg-[#1e1e2e] rounded-lg hover:bg-[#2a2a3a] transition-colors">
                          <SlidersHorizontal className="w-3 h-3" /> Set
                        </button>
                      </div>
                      <button className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 bg-[#1e1e2e] rounded-lg hover:bg-[#2a2a3a] transition-colors">
                        <Copy className="w-3.5 h-3.5" /> Clone
                      </button>
                    </div>
                  </div>

                  {/* Metric sub-cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-[10px] text-zinc-500 mb-1">Children Progress</p>
                      <p className="text-sm font-bold">
                        {swarm.children.completed} <span className="text-zinc-600 font-normal">/ {swarm.children.total}</span>
                      </p>
                      <div className="w-full bg-[#1e1e2e] rounded-full h-1.5 mt-2">
                        <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${childProgress}%` }} />
                      </div>
                    </div>
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-[10px] text-zinc-500 mb-1">Credit Spend</p>
                      <p className="text-sm font-bold text-amber-400">
                        {swarm.creditUsed.toLocaleString()} <span className="text-zinc-600 font-normal">/ {swarm.creditReserved.toLocaleString()}</span>
                      </p>
                      <div className="w-full bg-[#1e1e2e] rounded-full h-1.5 mt-2">
                        <div
                          className={`h-1.5 rounded-full transition-all ${creditPct > 80 ? "bg-red-500" : creditPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${creditPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-[10px] text-zinc-500 mb-1">Best Candidate</p>
                      <p className="text-sm font-bold text-purple-400">{swarm.bestScore.toFixed(2)}</p>
                      <p className="text-[10px] text-zinc-600 mt-1">Sharpe Ratio</p>
                    </div>
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-[10px] text-zinc-500 mb-1">Failure Rate</p>
                      <p className={`text-sm font-bold ${swarm.failureRate > 25 ? "text-red-400" : swarm.failureRate > 10 ? "text-amber-400" : "text-emerald-400"}`}>
                        {swarm.failureRate}%
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-1">{swarm.children.failed} failed</p>
                    </div>
                    <div className="bg-[#0a0a0f] rounded-lg p-3">
                      <p className="text-[10px] text-zinc-500 mb-1">Running Now</p>
                      <p className="text-sm font-bold text-emerald-400">{swarm.children.running}</p>
                      <p className="text-[10px] text-zinc-600 mt-1">sandboxes</p>
                    </div>
                  </div>

                  {/* Topology mini-diagram */}
                  <div className="pt-4 border-t border-[#1e1e2e]">
                    <p className="text-[10px] text-zinc-500 mb-3 uppercase tracking-wider font-medium">Topology</p>
                    <div className="flex flex-col items-center">
                      {/* Controller node */}
                      <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5">
                        <Target className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-mono text-blue-400 font-medium">Controller</span>
                      </div>

                      {/* Lines */}
                      <div className="relative w-full flex justify-center" style={{ height: 32 }}>
                        <div className="absolute top-0 w-px h-3 bg-[#2a2a3a]" />
                        <div className="absolute top-3 left-1/2 -translate-x-1/2" style={{ width: `${Math.min(swarm.children.total * 48, 400)}px` }}>
                          <div className="h-px bg-[#2a2a3a] w-full" />
                          {Array.from({ length: swarm.children.total }, (_, ci) => {
                            const spacing = swarm.children.total > 1 ? ci / (swarm.children.total - 1) : 0.5;
                            return (
                              <div key={ci} className="absolute top-0 w-px h-4 bg-[#2a2a3a]" style={{ left: `${spacing * 100}%` }} />
                            );
                          })}
                        </div>
                      </div>

                      {/* Child nodes */}
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        {Array.from({ length: swarm.children.total }, (_, ci) => {
                          let nodeStyle: string;
                          let label: string;
                          if (ci < swarm.children.completed) {
                            nodeStyle = "bg-blue-500/20 text-blue-400 border-blue-500/30";
                            label = "done";
                          } else if (ci < swarm.children.completed + swarm.children.running) {
                            nodeStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
                            label = "run";
                          } else if (ci < swarm.children.completed + swarm.children.running + swarm.children.failed) {
                            nodeStyle = "bg-red-500/20 text-red-400 border-red-500/30";
                            label = "fail";
                          } else {
                            nodeStyle = "bg-[#1e1e2e] text-zinc-600 border-[#2a2a3a]";
                            label = "idle";
                          }
                          return (
                            <div
                              key={ci}
                              className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center border ${nodeStyle}`}
                            >
                              <Cpu className="w-3.5 h-3.5" />
                              <span className="text-[8px] mt-0.5 font-mono">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template Library */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Template Library</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <div key={tpl.name} className={`bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3a] transition-colors group cursor-pointer`}>
                <div className={`w-10 h-10 ${tpl.bg} border ${tpl.border} rounded-lg flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${tpl.color}`} />
                </div>
                <h3 className="text-sm font-semibold mb-2 group-hover:text-blue-400 transition-colors">{tpl.name}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed mb-4">{tpl.description}</p>
                <div className="space-y-2 text-[11px]">
                  {Object.entries(tpl.defaults).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-zinc-500 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className="text-zinc-300 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors">
                  <Zap className="w-3.5 h-3.5" /> Launch Swarm
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
