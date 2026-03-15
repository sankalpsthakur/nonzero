"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Brain, Network, Sparkles, Play, Eye, Rocket,
  Building2, Shield, Scale, Bot, ChevronRight, Clock,
  CheckCircle, XCircle, AlertTriangle, Ban,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const agentProfiles: Record<string, {
  name: string; kind: string; icon: typeof Brain; mandate: string; status: string;
  color: string; bg: string; border: string;
  stats: { totalTasks: number; successRate: number; avgDuration: string; activeChildren: number };
  breakdown: { success: number; partial: number; failed: number; blocked: number };
}> = {
  "AGT-001": {
    name: "Atlas", kind: "Research Director", icon: Brain,
    mandate: "Atlas is the chief intelligence behind the research pipeline. It continuously evaluates which hypotheses to explore next based on information gain, resource availability, and strategic priorities. It coordinates between the Strategy Generator, Critic, and Swarm Orchestrator to ensure the most promising research directions receive adequate compute and attention. Atlas maintains a priority queue of experiments, balances exploration vs exploitation, and enforces the research budget.",
    status: "ACTIVE",
    color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20",
    stats: { totalTasks: 312, successRate: 94, avgDuration: "12m 34s", activeChildren: 3 },
    breakdown: { success: 293, partial: 8, failed: 7, blocked: 4 },
  },
  "AGT-002": {
    name: "Hivemind", kind: "Swarm Orchestrator", icon: Network,
    mandate: "Hivemind manages multi-sandbox swarm runs, dynamically allocating resources and pruning underperforming children. It decides when to spawn new experiments, when to terminate failing ones, and how to redistribute compute across the swarm fleet. Hivemind monitors credit budgets and failure rates, automatically pausing swarms that exceed cost thresholds.",
    status: "ACTIVE",
    color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20",
    stats: { totalTasks: 189, successRate: 88, avgDuration: "28m 15s", activeChildren: 5 },
    breakdown: { success: 166, partial: 12, failed: 8, blocked: 3 },
  },
};

const defaultProfile = {
  name: "Atlas", kind: "Research Director", icon: Brain,
  mandate: "Orchestrates the research pipeline, prioritizing which hypotheses to explore based on information gain, resource budget, and strategic objectives. Maintains a priority queue of experiments, balances exploration vs exploitation, and ensures the most promising research directions receive adequate compute and attention. Coordinates between the Strategy Generator, Critic, and Swarm Orchestrator.",
  status: "ACTIVE",
  color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20",
  stats: { totalTasks: 312, successRate: 94, avgDuration: "12m 34s", activeChildren: 3 },
  breakdown: { success: 293, partial: 8, failed: 7, blocked: 4 },
};

// 12 tasks
const tasks = [
  { id: "TSK-312", type: "EVALUATE", status: "RUNNING", input: "Evaluate momentum factor variants for Q2 research cycle", output: "Processing 8 candidate strategies...", duration: "3m 21s", startedAt: "09:14:32" },
  { id: "TSK-311", type: "PRIORITIZE", status: "SUCCESS", input: "Re-rank experiment queue after SWM-001 results", output: "Promoted EXP-013 to top priority, deferred EXP-007", duration: "1m 45s", startedAt: "09:08:15" },
  { id: "TSK-310", type: "COORDINATE", status: "SUCCESS", input: "Allocate resources for Frontier Explorer Alpha swarm", output: "Allocated 3 additional sandboxes, budget: 4500 credits", duration: "0m 52s", startedAt: "08:55:00" },
  { id: "TSK-309", type: "REVIEW", status: "SUCCESS", input: "Review Sentinel critique of EXP-012 overfitting concerns", output: "Accepted critique, demoted EXP-012 to FAILED status", duration: "2m 18s", startedAt: "08:42:30" },
  { id: "TSK-308", type: "SPAWN", status: "SUCCESS", input: "Create new experiment for dispersion alpha hypothesis", output: "Created EXP-013 with Volatility family classification", duration: "0m 34s", startedAt: "08:30:00" },
  { id: "TSK-307", type: "EVALUATE", status: "PARTIAL", input: "Assess cross-sectional momentum strategy viability", output: "Partially complete — awaiting additional backtesting data", duration: "8m 12s", startedAt: "08:15:22" },
  { id: "TSK-306", type: "COORDINATE", status: "SUCCESS", input: "Coordinate with Deployer on Trend Following v6 promotion", output: "Approved paper-to-shadow-live promotion path", duration: "1m 07s", startedAt: "07:55:00" },
  { id: "TSK-305", type: "PRIORITIZE", status: "FAILED", input: "Re-rank after market regime detection signal", output: "Error: Regime classifier returned ambiguous signal (p=0.52)", duration: "4m 33s", startedAt: "07:30:15" },
  { id: "TSK-304", type: "REVIEW", status: "SUCCESS", input: "Review Runner output for Vol Crush v2 backtest", output: "Approved results, Sharpe 1.67 meets threshold", duration: "1m 22s", startedAt: "07:15:00" },
  { id: "TSK-303", type: "EVALUATE", status: "SUCCESS", input: "Evaluate information ratio of sector rotation signals", output: "IR=0.72, above threshold. Recommended for extended testing.", duration: "5m 41s", startedAt: "06:45:30" },
  { id: "TSK-302", type: "SPAWN", status: "BLOCKED", input: "Create carry trade variant experiment", output: "Blocked: Credit budget exhausted for Momentum family", duration: "-", startedAt: "06:30:00" },
  { id: "TSK-301", type: "COORDINATE", status: "SUCCESS", input: "Sync experiment priorities with Guardian risk constraints", output: "Aligned — no position limit conflicts detected", duration: "0m 48s", startedAt: "06:15:00" },
];

// 6 decision log entries
const decisions = [
  {
    time: "09:14:32",
    decision: "Initiated evaluation of momentum factor variants",
    reasoning: "Q2 research cycle starting. Momentum family has highest expected information gain based on recent market regime shift to trending. Allocated evaluation task to explore 8 candidate modifications to existing Alpha v4.",
  },
  {
    time: "09:08:15",
    decision: "Promoted EXP-013 (Dispersion Alpha) to top priority",
    reasoning: "Frontier Explorer swarm returned Sharpe 1.89 for dispersion strategy, exceeding the 1.5 threshold for priority promotion. Cross-correlation regime indicator shows declining correlation (0.58), creating favorable conditions.",
  },
  {
    time: "08:42:30",
    decision: "Accepted Sentinel critique and demoted EXP-012",
    reasoning: "Sentinel identified significant overfitting in Iron Condor Weekly: train/test Sharpe divergence of 1.4 (threshold: 0.5). Walk-forward degradation pattern detected. Strategy marked as FAILED pending human review.",
  },
  {
    time: "08:30:00",
    decision: "Created EXP-013 for dispersion alpha hypothesis",
    reasoning: "Novel hypothesis from research pipeline: index vs single-stock volatility dispersion. Literature support strong. Initial screening suggests 21.6% return potential with controlled tail risk. Assigned to Volatility family.",
  },
  {
    time: "07:55:00",
    decision: "Approved Trend Following v6 for shadow-live promotion",
    reasoning: "42 backtest runs completed. Best Sharpe 2.28, consistent across 3 market regimes. Sentinel cleared for overfitting. Risk Guardian approved position limits. Paper trading results align with backtest (tracking error < 2%).",
  },
  {
    time: "06:45:30",
    decision: "Recommended sector rotation signals for extended testing",
    reasoning: "Information ratio of 0.72 exceeds 0.5 threshold. However, limited to 8 runs. Decision: extend testing with Robustness Auditor swarm to validate across stress scenarios before considering promotion.",
  },
];

// Spawned children for orchestrators
const spawnedChildren = [
  { id: "AGT-003", name: "Forge", kind: "Strategy Generator", status: "ACTIVE", icon: Sparkles },
  { id: "AGT-004", name: "Runner", kind: "Backtest Runner", status: "ACTIVE", icon: Play },
  { id: "AGT-005", name: "Sentinel", kind: "Critic", status: "IDLE", icon: Eye },
];

const taskStatusConfig: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  RUNNING: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: Play },
  SUCCESS: { bg: "bg-blue-500/20", text: "text-blue-400", icon: CheckCircle },
  PARTIAL: { bg: "bg-amber-500/20", text: "text-amber-400", icon: AlertTriangle },
  FAILED: { bg: "bg-red-500/20", text: "text-red-400", icon: XCircle },
  BLOCKED: { bg: "bg-zinc-500/20", text: "text-zinc-400", icon: Ban },
};

const taskTypeStyles: Record<string, string> = {
  EVALUATE: "bg-purple-500/15 text-purple-400",
  PRIORITIZE: "bg-blue-500/15 text-blue-400",
  COORDINATE: "bg-cyan-500/15 text-cyan-400",
  REVIEW: "bg-amber-500/15 text-amber-400",
  SPAWN: "bg-emerald-500/15 text-emerald-400",
};

const DONUT_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#71717a"];

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-2.5 shadow-xl">
      <p className="text-xs font-medium" style={{ color: payload[0].payload.fill }}>
        {payload[0].name}: {payload[0].value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const agent = agentProfiles[id] ?? defaultProfile;
  const Icon = agent.icon;

  const donutData = [
    { name: "Success", value: agent.breakdown.success, fill: DONUT_COLORS[0] },
    { name: "Partial", value: agent.breakdown.partial, fill: DONUT_COLORS[1] },
    { name: "Failed", value: agent.breakdown.failed, fill: DONUT_COLORS[2] },
    { name: "Blocked", value: agent.breakdown.blocked, fill: DONUT_COLORS[3] },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Agents
      </Link>

      {/* Profile Header */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6">
        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 ${agent.bg} border ${agent.border} rounded-2xl flex items-center justify-center shrink-0`}>
            <Icon className={`w-8 h-8 ${agent.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${
                agent.status === "ACTIVE"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
              }`}>
                {agent.status === "ACTIVE" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />}
                {agent.status}
              </span>
            </div>
            <p className={`text-xs font-medium ${agent.color} mb-3`}>{agent.kind}</p>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">{agent.mandate}</p>
            <p className="text-xs text-zinc-600 mt-2 font-mono">{id}</p>
          </div>
        </div>
      </div>

      {/* Donut + Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut Chart */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Task Outcome Breakdown</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={donutData}
                  innerRadius={40}
                  outerRadius={62}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                  <span className="text-zinc-400">{d.name}</span>
                  <span className="text-zinc-300 font-mono ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Tasks", value: agent.stats.totalTasks.toLocaleString(), color: "text-white" },
            { label: "Success Rate", value: `${agent.stats.successRate}%`, color: agent.color },
            { label: "Avg Duration", value: agent.stats.avgDuration, color: "text-cyan-400" },
            { label: "Active Children", value: agent.stats.activeChildren.toString(), color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex flex-col justify-center">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Tasks Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Tasks</h2>
          <span className="text-[10px] text-zinc-500">{tasks.length} tasks shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left py-3 px-4 font-medium">ID</th>
                <th className="text-left py-3 px-3 font-medium">Type</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-left py-3 px-3 font-medium">Input</th>
                <th className="text-left py-3 px-3 font-medium">Output</th>
                <th className="text-right py-3 px-3 font-medium">Duration</th>
                <th className="text-right py-3 px-4 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const tsCfg = taskStatusConfig[task.status];
                const StatusIcon = tsCfg.icon;
                return (
                  <tr key={task.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-zinc-500">{task.id}</td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${taskTypeStyles[task.type] ?? "bg-zinc-500/15 text-zinc-400"}`}>
                        {task.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${tsCfg.bg} ${tsCfg.text}`}>
                        <StatusIcon className="w-3 h-3" />
                        {task.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-zinc-400 max-w-[220px] truncate">{task.input}</td>
                    <td className="py-3 px-3 text-xs text-zinc-500 max-w-[220px] truncate">{task.output}</td>
                    <td className="py-3 px-3 text-right text-xs font-mono text-zinc-400">{task.duration}</td>
                    <td className="py-3 px-4 text-right text-xs font-mono text-zinc-500">{task.startedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Decision Log Timeline */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Decision Log</h2>
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-[#1e1e2e]" />

            {decisions.map((d, i) => (
              <div key={i} className="relative pl-9 pb-5 last:pb-0">
                {/* Dot */}
                <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-[#111118] border-2 border-blue-500/50" />

                <div className="p-3 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">{d.time}</span>
                  </div>
                  <p className="text-xs font-medium text-white mb-1.5">{d.decision}</p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{d.reasoning}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spawned Children */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Spawned Children</h2>
          <p className="text-xs text-zinc-500 mb-4">Agents currently managed by {agent.name} in the orchestration hierarchy.</p>

          <div className="space-y-3">
            {spawnedChildren.map((child) => {
              const ChildIcon = child.icon;
              return (
                <Link key={child.id} href={`/agents/${child.id}`} className="group block">
                  <div className="flex items-center justify-between p-3 border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#0a0a0f] rounded-lg flex items-center justify-center">
                        <ChildIcon className="w-4 h-4 text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium group-hover:text-blue-400 transition-colors">{child.name}</p>
                        <p className="text-[10px] text-zinc-500">{child.kind}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${child.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
                      <span className="text-[10px] text-zinc-500">{child.status}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Visual hierarchy diagram */}
          <div className="mt-6 pt-4 border-t border-[#1e1e2e]">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">Orchestration Hierarchy</p>
            <div className="flex flex-col items-center gap-2">
              {/* Parent */}
              <div className={`flex items-center gap-2 px-4 py-2.5 ${agent.bg} border ${agent.border} rounded-lg`}>
                <Icon className={`w-4 h-4 ${agent.color}`} />
                <span className={`text-xs font-medium ${agent.color}`}>{agent.name}</span>
              </div>

              {/* Lines */}
              <div className="w-px h-4 bg-[#2a2a3a]" />
              <div className="flex items-start gap-4">
                {spawnedChildren.map((child) => {
                  const ChildIcon2 = child.icon;
                  return (
                    <div key={child.id} className="flex flex-col items-center gap-1">
                      <div className="w-px h-3 bg-[#2a2a3a]" />
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg">
                        <ChildIcon2 className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] font-mono text-zinc-400">{child.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
