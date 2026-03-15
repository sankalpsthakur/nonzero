"use client";

import Link from "next/link";
import {
  Bot, Brain, Network, Sparkles, Play, Eye, Rocket,
  Building2, Shield, Scale, ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock — 9 agents, one per kind
// ---------------------------------------------------------------------------

const agents = [
  {
    id: "AGT-001", name: "Atlas", kind: "Research Director", icon: Brain,
    mandate: "Orchestrates the research pipeline, prioritizing which hypotheses to explore based on information gain and resource budget.",
    status: "ACTIVE", successRate: 94, totalTasks: 312, currentTask: "Evaluating momentum factor variants for Q2",
    color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20",
  },
  {
    id: "AGT-002", name: "Hivemind", kind: "Swarm Orchestrator", icon: Network,
    mandate: "Manages multi-sandbox swarm runs, dynamically allocating resources and pruning underperforming children.",
    status: "ACTIVE", successRate: 88, totalTasks: 189, currentTask: "Coordinating Frontier Explorer Alpha (SWM-001)",
    color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20",
  },
  {
    id: "AGT-003", name: "Forge", kind: "Strategy Generator", icon: Sparkles,
    mandate: "Generates novel trading strategy code from research hypotheses, combining signals and risk management approaches.",
    status: "ACTIVE", successRate: 72, totalTasks: 456, currentTask: "Generating dispersion trade implementation",
    color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20",
  },
  {
    id: "AGT-004", name: "Runner", kind: "Backtest Runner", icon: Play,
    mandate: "Executes backtests in sandboxed environments with walk-forward validation, parameter sweeps, and Monte Carlo analysis.",
    status: "ACTIVE", successRate: 91, totalTasks: 1024, currentTask: "Running walk-forward pass #3 for EXP-001",
    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
  },
  {
    id: "AGT-005", name: "Sentinel", kind: "Critic", icon: Eye,
    mandate: "Reviews strategy outputs for overfitting, data leakage, survivorship bias, and other statistical pitfalls.",
    status: "IDLE", successRate: 96, totalTasks: 278, currentTask: null,
    color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20",
  },
  {
    id: "AGT-006", name: "Deployer", kind: "Deployment Agent", icon: Rocket,
    mandate: "Handles promotion of strategies from paper trading to shadow-live and live environments with phased rollout.",
    status: "IDLE", successRate: 98, totalTasks: 67, currentTask: null,
    color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20",
  },
  {
    id: "AGT-007", name: "Broker", kind: "Broker Agent", icon: Building2,
    mandate: "Manages order routing, execution quality monitoring, and broker API connectivity across multiple venues.",
    status: "ACTIVE", successRate: 99, totalTasks: 8432, currentTask: "Monitoring execution quality for 23 live positions",
    color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20",
  },
  {
    id: "AGT-008", name: "Guardian", kind: "Risk Guardian", icon: Shield,
    mandate: "Enforces position limits, drawdown breakers, correlation checks, and real-time risk metrics across all live strategies.",
    status: "ACTIVE", successRate: 100, totalTasks: 15670, currentTask: "Monitoring portfolio risk — VaR within bounds",
    color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20",
  },
  {
    id: "AGT-009", name: "Auditor", kind: "Reconciliation", icon: Scale,
    mandate: "Reconciles positions, P&L, and cash flows between internal ledger, broker statements, and exchange records.",
    status: "IDLE", successRate: 97, totalTasks: 2140, currentTask: null,
    color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20",
  },
];

const statusStyles: Record<string, { dot: string; label: string; textColor: string }> = {
  ACTIVE: { dot: "bg-emerald-500", label: "Active", textColor: "text-emerald-400" },
  IDLE: { dot: "bg-zinc-500", label: "Idle", textColor: "text-zinc-400" },
  ERROR: { dot: "bg-red-500", label: "Error", textColor: "text-red-400" },
};

// Circular progress SVG
function CircularProgress({ percent, color, size = 48 }: { percent: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e2e" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={color}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-mono font-bold">
        {percent}%
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-400" />
          Agent Profiles
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {agents.length} autonomous agents powering the nonzero platform &middot; {agents.filter((a) => a.status === "ACTIVE").length} currently active
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Agents", value: agents.length.toString(), color: "text-white" },
          { label: "Active Now", value: agents.filter((a) => a.status === "ACTIVE").length.toString(), color: "text-emerald-400" },
          { label: "Total Tasks Completed", value: agents.reduce((n, a) => n + a.totalTasks, 0).toLocaleString(), color: "text-blue-400" },
          { label: "Avg Success Rate", value: `${Math.round(agents.reduce((n, a) => n + a.successRate, 0) / agents.length)}%`, color: "text-purple-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const Icon = agent.icon;
          const st = statusStyles[agent.status];

          return (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="group">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3a] transition-all h-full">
                {/* Top row: icon + status */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 ${agent.bg} border ${agent.border} rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${agent.color}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${st.dot} ${agent.status === "ACTIVE" ? "animate-pulse" : ""}`} />
                    <span className={`text-[10px] font-medium ${st.textColor}`}>{st.label}</span>
                  </div>
                </div>

                {/* Name + kind */}
                <h3 className="text-sm font-semibold group-hover:text-blue-400 transition-colors">{agent.name}</h3>
                <p className={`text-[10px] font-medium ${agent.color} mb-2`}>{agent.kind}</p>

                {/* Mandate */}
                <p className="text-xs text-zinc-500 leading-relaxed mb-4 line-clamp-2">{agent.mandate}</p>

                {/* Metrics row */}
                <div className="flex items-center gap-4 pt-3 border-t border-[#1e1e2e]">
                  <CircularProgress percent={agent.successRate} color={agent.color} />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Total tasks</span>
                      <span className="text-zinc-300 font-mono">{agent.totalTasks.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Success rate</span>
                      <span className={`font-mono ${agent.color}`}>{agent.successRate}%</span>
                    </div>
                  </div>
                </div>

                {/* Current task */}
                {agent.currentTask && (
                  <div className="mt-3 p-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg">
                    <p className="text-[10px] text-zinc-500 mb-0.5">Current task</p>
                    <p className="text-[11px] text-zinc-300 truncate">{agent.currentTask}</p>
                  </div>
                )}

                {/* Navigate arrow */}
                <div className="flex justify-end mt-3">
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
