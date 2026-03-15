"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from "recharts";
import {
  TrendingUp, Activity, Trophy, Zap, Coins, Network,
  Clock, AlertTriangle, CheckCircle, XCircle, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Eye
} from "lucide-react";

// ── Mock Data ──────────────────────────────────────────────

const heroStats = [
  { label: "Total Strategies", value: "47", change: "+5", up: true, icon: TrendingUp, color: "blue" },
  { label: "Active Runs", value: "12", change: "+3", up: true, icon: Activity, color: "emerald" },
  { label: "Win Rate", value: "68.4%", change: "+2.1%", up: true, icon: Trophy, color: "amber" },
  { label: "Portfolio Alpha", value: "+4.7%", change: "+0.8%", up: true, icon: Zap, color: "purple" },
  { label: "Credit Balance", value: "24,580", change: "-1,200", up: false, icon: Coins, color: "cyan" },
  { label: "Active Swarms", value: "3", change: "+1", up: true, icon: Network, color: "rose" },
];

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-400", ring: "ring-purple-500/20" },
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-400", ring: "ring-cyan-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-400", ring: "ring-rose-500/20" },
};

const leaderboard = [
  { rank: 1, name: "Momentum Alpha v3", returnPct: 34.2, alphaPct: 12.8, sharpe: 2.41, drawdown: 8.3, status: "LIVE", env: "Production" },
  { rank: 2, name: "Mean Reversion Pro", returnPct: 28.7, alphaPct: 10.1, sharpe: 2.18, drawdown: 6.1, status: "SHADOW", env: "Shadow-Live" },
  { rank: 3, name: "Breakout Hunter v2", returnPct: 26.4, alphaPct: 9.5, sharpe: 1.94, drawdown: 11.2, status: "PAPER", env: "Paper" },
  { rank: 4, name: "Pair Trader NIFTY", returnPct: 22.1, alphaPct: 7.3, sharpe: 1.87, drawdown: 5.4, status: "LIVE", env: "Production" },
  { rank: 5, name: "Volatility Crush", returnPct: 19.8, alphaPct: 6.9, sharpe: 1.76, drawdown: 9.7, status: "PAPER", env: "Paper" },
  { rank: 6, name: "Sector Rotation v4", returnPct: 18.3, alphaPct: 5.2, sharpe: 1.65, drawdown: 7.8, status: "BACKTEST", env: "Research" },
  { rank: 7, name: "Intraday Scalper", returnPct: 16.7, alphaPct: 4.8, sharpe: 1.52, drawdown: 13.1, status: "LIVE", env: "Production" },
  { rank: 8, name: "Options Gamma", returnPct: 15.2, alphaPct: 4.1, sharpe: 1.43, drawdown: 10.5, status: "SHADOW", env: "Shadow-Live" },
  { rank: 9, name: "Event Driven v2", returnPct: 13.8, alphaPct: 3.6, sharpe: 1.31, drawdown: 8.9, status: "PAPER", env: "Paper" },
  { rank: 10, name: "Carry Trade Macro", returnPct: 11.4, alphaPct: 2.9, sharpe: 1.22, drawdown: 6.3, status: "BACKTEST", env: "Research" },
];

const activeRuns = [
  { id: "run-a7x", sandbox: "sb-frontier-001", experiment: "Momentum Alpha v4", progress: 78, elapsed: "2h 34m", step: "Walk-forward #3" },
  { id: "run-b3k", sandbox: "sb-robustness-012", experiment: "Mean Reversion Pro", progress: 45, elapsed: "1h 12m", step: "Monte Carlo sim" },
  { id: "run-c9p", sandbox: "sb-divergence-007", experiment: "Breakout Hunter v3", progress: 92, elapsed: "4h 01m", step: "Final validation" },
  { id: "run-d2m", sandbox: "sb-frontier-002", experiment: "Volatility Crush v2", progress: 15, elapsed: "0h 18m", step: "Data ingestion" },
  { id: "run-e5n", sandbox: "sb-frontier-003", experiment: "Sector Rotation v5", progress: 61, elapsed: "1h 55m", step: "Backtest epoch 7" },
];

const equityCurve = Array.from({ length: 12 }, (_, i) => {
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i];
  const base = 100000 + i * 4200 + Math.random() * 3000;
  const benchmark = 100000 + i * 2800 + Math.random() * 2000;
  return { month, portfolio: Math.round(base), benchmark: Math.round(benchmark) };
});

const divergenceData = [
  { metric: "Return", live: 4.2, expected: 3.8 },
  { metric: "Sharpe", live: 1.8, expected: 2.1 },
  { metric: "Win Rate", live: 62, expected: 68 },
  { metric: "Drawdown", live: 7.2, expected: 5.5 },
  { metric: "Turnover", live: 34, expected: 30 },
];

const pendingApprovals = [
  { id: 1, type: "PROMOTE_LIVE", desc: "Promote Momentum Alpha v3 to Live", by: "Research Director", at: "2 hours ago", urgency: "high" },
  { id: 2, type: "CAPITAL_INCREASE", desc: "Increase capital for Pair Trader to 5L", by: "Swarm Orchestrator", at: "4 hours ago", urgency: "medium" },
  { id: 3, type: "KILL_SWITCH", desc: "Deactivate Intraday Scalper risk breach", by: "Risk Guardian", at: "30 min ago", urgency: "critical" },
];

const recentIncidents = [
  { id: 1, type: "DRAWDOWN_BREACH", severity: "HIGH", desc: "Max drawdown exceeded on Intraday Scalper", time: "30 min ago" },
  { id: 2, type: "DIVERGENCE", severity: "MEDIUM", desc: "Live vs expected divergence > 2 std on Mean Reversion", time: "2 hours ago" },
  { id: 3, type: "HEARTBEAT_MISS", severity: "LOW", desc: "Sandbox sb-frontier-002 missed 3 heartbeats", time: "4 hours ago" },
  { id: 4, type: "ORDER_REJECTION", severity: "MEDIUM", desc: "Broker rejected 5 orders for Pair Trader", time: "6 hours ago" },
];

const statusColor: Record<string, string> = {
  LIVE: "bg-emerald-500/20 text-emerald-400",
  SHADOW: "bg-purple-500/20 text-purple-400",
  PAPER: "bg-blue-500/20 text-blue-400",
  BACKTEST: "bg-zinc-500/20 text-zinc-400",
};

const severityColor: Record<string, string> = {
  LOW: "bg-blue-500/20 text-blue-400",
  MEDIUM: "bg-amber-500/20 text-amber-400",
  HIGH: "bg-orange-500/20 text-orange-400",
  CRITICAL: "bg-red-500/20 text-red-400",
};

const urgencyColor: Record<string, string> = {
  low: "border-blue-500/30",
  medium: "border-amber-500/30",
  high: "border-orange-500/30",
  critical: "border-red-500/30",
};

const typeColor: Record<string, string> = {
  PROMOTE_LIVE: "bg-emerald-500/20 text-emerald-400",
  CAPITAL_INCREASE: "bg-blue-500/20 text-blue-400",
  KILL_SWITCH: "bg-red-500/20 text-red-400",
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

export function DashboardClient() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time overview of your research and live operations</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          All systems operational
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {heroStats.map((stat) => {
          const Icon = stat.icon;
          const c = colorMap[stat.color];
          return (
            <div key={stat.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#2a2a3a] transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${c.text}`} />
                </div>
                <span className={`text-xs flex items-center gap-0.5 ${stat.up ? "text-emerald-400" : "text-red-400"}`}>
                  {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {stat.change}
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve */}
        <div className="lg:col-span-2 bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Equity Curve</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Portfolio value vs benchmark (12 months)</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 rounded" /> Portfolio</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-zinc-500 rounded" /> Benchmark</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={equityCurve}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2e" }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2e" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="portfolio" stroke="#3b82f6" fill="url(#portfolioGrad)" strokeWidth={2} name="Portfolio" />
              <Area type="monotone" dataKey="benchmark" stroke="#52525b" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" name="Benchmark" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Live vs Expected */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Live vs Expected</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Divergence metrics</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={divergenceData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="metric" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2e" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="live" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Live" />
              <Bar dataKey="expected" fill="#52525b" radius={[4, 4, 0, 0]} name="Expected" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Frontier Leaderboard */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Frontier Leaderboard</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Top 10 strategies ranked by composite score</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">#</th>
                <th className="text-left py-3 px-3 font-medium">Strategy</th>
                <th className="text-right py-3 px-3 font-medium">Return%</th>
                <th className="text-right py-3 px-3 font-medium">Alpha%</th>
                <th className="text-right py-3 px-3 font-medium">Sharpe</th>
                <th className="text-right py-3 px-3 font-medium">Max DD%</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Environment</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((s) => (
                <tr key={s.rank} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors cursor-pointer">
                  <td className="py-3 px-5 text-zinc-500 font-mono">{s.rank}</td>
                  <td className="py-3 px-3 font-medium">{s.name}</td>
                  <td className="py-3 px-3 text-right text-emerald-400 font-mono">+{s.returnPct}%</td>
                  <td className="py-3 px-3 text-right text-blue-400 font-mono">+{s.alphaPct}%</td>
                  <td className="py-3 px-3 text-right font-mono">{s.sharpe}</td>
                  <td className="py-3 px-3 text-right text-red-400 font-mono">-{s.drawdown}%</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="py-3 px-5 text-zinc-400 text-xs">{s.env}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row: Active Runs, Approvals, Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Runs */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Active Runs</h2>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{activeRuns.length} running</span>
          </div>
          <div className="space-y-3">
            {activeRuns.map((run) => (
              <div key={run.id} className="border border-[#1e1e2e] rounded-lg p-3 hover:border-[#2a2a3a] transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium truncate">{run.experiment}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{run.sandbox}</span>
                </div>
                <div className="w-full bg-[#1e1e2e] rounded-full h-1.5 mb-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${run.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{run.elapsed}</span>
                  <span>{run.step}</span>
                  <span className="font-mono">{run.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Approval Inbox */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Approval Inbox</h2>
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{pendingApprovals.length} pending</span>
          </div>
          <div className="space-y-3">
            {pendingApprovals.map((a) => (
              <div key={a.id} className={`border-l-2 ${urgencyColor[a.urgency]} bg-[#0f0f17] rounded-r-lg p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor[a.type]}`}>{a.type.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-zinc-500">{a.at}</span>
                </div>
                <p className="text-xs text-zinc-300 mb-2">{a.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">by {a.by}</span>
                  <div className="flex gap-1.5">
                    <button className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Approve
                    </button>
                    <button className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Recent Incidents</h2>
            <ShieldAlert className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="space-y-3">
            {recentIncidents.map((inc) => (
              <div key={inc.id} className="border border-[#1e1e2e] rounded-lg p-3 hover:border-[#2a2a3a] transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${severityColor[inc.severity]}`}>{inc.severity}</span>
                  <span className="text-[10px] text-zinc-500">{inc.time}</span>
                </div>
                <p className="text-xs text-zinc-300 mb-1">{inc.desc}</p>
                <span className="text-[10px] text-zinc-500 font-mono">{inc.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
