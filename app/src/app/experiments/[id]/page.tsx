"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Beaker, ArrowLeft, GitFork, Rocket, TrendingUp, TrendingDown,
  Activity, Target, Shield, Trophy, Download, FileText, Clock,
  CheckCircle, XCircle, Play, ChevronRight, BarChart3, Image,
  Code2, FileSpreadsheet,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const experimentMap: Record<string, {
  name: string; family: string; status: string;
  hypothesis: string; runs: number;
  metrics: { returnPct: number; alphaPct: number; sharpe: number; sortino: number; maxDD: number; winRate: number };
}> = {
  "EXP-001": {
    name: "Momentum Alpha v4", family: "Momentum", status: "RUNNING",
    hypothesis: "RSI divergence combined with volume breakouts on NIFTY50 stocks yields higher alpha in trending markets. The strategy identifies divergence between price and RSI on the daily timeframe, then confirms entries using 15-minute volume spikes above 2x average. Risk is managed via ATR-based trailing stops with a 2R target.",
    runs: 24,
    metrics: { returnPct: 34.2, alphaPct: 12.8, sharpe: 2.41, sortino: 3.12, maxDD: -8.3, winRate: 68.4 },
  },
};

// Default for any ID not in the map
const defaultExp = {
  name: "Dispersion Alpha v1", family: "Volatility", status: "RUNNING",
  hypothesis: "Index vs single-stock volatility dispersion trading exploiting correlation breakdown periods. Long individual stock options, short index options when cross-correlation drops below 0.6 threshold.",
  runs: 7,
  metrics: { returnPct: 21.6, alphaPct: 8.4, sharpe: 1.89, sortino: 2.47, maxDD: -11.2, winRate: 62.1 },
};

const equityData = Array.from({ length: 90 }, (_, i) => {
  const base = 100000;
  const trend = i * 650;
  const noise = Math.sin(i / 7) * 4000 + Math.sin(i / 13) * 2500;
  const drawdown = i > 35 && i < 45 ? -(i - 35) * 800 : 0;
  return {
    day: i + 1,
    portfolio: Math.round(base + trend + noise + drawdown + Math.random() * 1500),
    benchmark: Math.round(base + i * 380 + Math.sin(i / 11) * 1500 + Math.random() * 800),
  };
});

const factorAttribution = [
  { factor: "Momentum", contribution: 42, color: "#3b82f6" },
  { factor: "Value", contribution: 18, color: "#8b5cf6" },
  { factor: "Volatility", contribution: 24, color: "#f59e0b" },
  { factor: "Quality", contribution: 11, color: "#10b981" },
  { factor: "Size", contribution: 5, color: "#ec4899" },
];

const runs = [
  { id: "RUN-024", attempt: 24, status: "RUNNING", valBpb: 0.0312, returnPct: 34.2, duration: "2h 34m", sandbox: "sb-frontier-001" },
  { id: "RUN-023", attempt: 23, status: "COMPLETED", valBpb: 0.0298, returnPct: 31.5, duration: "4h 12m", sandbox: "sb-frontier-001" },
  { id: "RUN-022", attempt: 22, status: "COMPLETED", valBpb: 0.0285, returnPct: 30.7, duration: "3h 58m", sandbox: "sb-frontier-002" },
  { id: "RUN-021", attempt: 21, status: "FAILED", valBpb: 0, returnPct: 0, duration: "0h 45m", sandbox: "sb-frontier-001" },
  { id: "RUN-020", attempt: 20, status: "COMPLETED", valBpb: 0.0276, returnPct: 28.9, duration: "5h 30m", sandbox: "sb-frontier-003" },
  { id: "RUN-019", attempt: 19, status: "COMPLETED", valBpb: 0.0261, returnPct: 26.1, duration: "3h 22m", sandbox: "sb-frontier-001" },
  { id: "RUN-018", attempt: 18, status: "COMPLETED", valBpb: 0.0254, returnPct: 25.4, duration: "4h 05m", sandbox: "sb-frontier-002" },
  { id: "RUN-017", attempt: 17, status: "COMPLETED", valBpb: 0.0241, returnPct: 24.1, duration: "3h 48m", sandbox: "sb-frontier-001" },
];

const artifacts = [
  { name: "strategy_v4_snapshot.py", size: "12 KB", type: "Code", icon: Code2, color: "text-emerald-400" },
  { name: "equity_curve_best.png", size: "340 KB", type: "Chart", icon: Image, color: "text-blue-400" },
  { name: "backtest_full_report.html", size: "2.4 MB", type: "Report", icon: FileText, color: "text-purple-400" },
  { name: "trade_log.csv", size: "890 KB", type: "Trades", icon: FileSpreadsheet, color: "text-amber-400" },
  { name: "parameter_sweep.json", size: "156 KB", type: "Config", icon: FileText, color: "text-cyan-400" },
];

const statusColor: Record<string, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  COMPLETED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
  DRAFT: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const runStatusColor: Record<string, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400",
  COMPLETED: "bg-blue-500/20 text-blue-400",
  FAILED: "bg-red-500/20 text-red-400",
};

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 shadow-xl">
      <p className="text-[10px] text-zinc-500 mb-1.5 font-mono">Day {label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs font-medium font-mono" style={{ color: entry.color }}>
          {entry.name}: {"\u20B9"}{entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExperimentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const exp = experimentMap[id] ?? defaultExp;

  const metricCards = [
    { label: "Return", value: `+${exp.metrics.returnPct}%`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Alpha", value: `+${exp.metrics.alphaPct}%`, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Sharpe", value: exp.metrics.sharpe.toFixed(2), icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Sortino", value: exp.metrics.sortino.toFixed(2), icon: Trophy, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Max Drawdown", value: `${exp.metrics.maxDD}%`, icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Win Rate", value: `${exp.metrics.winRate}%`, icon: Shield, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Back navigation */}
      <Link href="/experiments" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Experiments
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
            <Link href="/experiments" className="hover:text-zinc-300 transition-colors">Experiments</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-zinc-400">{exp.family}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white font-medium">{exp.name}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-2xl font-bold tracking-tight">{exp.name}</h1>
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${statusColor[exp.status]}`}>
              {exp.status === "RUNNING" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />}
              {exp.status}
            </span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
            {exp.hypothesis}
          </p>
          <p className="text-xs text-zinc-600 mt-2 font-mono">{id} &middot; {exp.family} Family &middot; {exp.runs} runs</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-[#111118] border border-[#1e1e2e] text-sm text-zinc-300 rounded-lg hover:border-[#2a2a3a] transition-colors">
            <GitFork className="w-4 h-4" /> Fork
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 text-sm text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors">
            <Rocket className="w-4 h-4" /> Promote
          </button>
        </div>
      </div>

      {/* Metric Hero Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#2a2a3a] transition-colors">
              <div className={`w-8 h-8 ${m.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${m.color}`} />
              </div>
              <p className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{m.label}</p>
            </div>
          );
        })}
      </div>

      {/* Equity Curve */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Equity Curve</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Best run performance &middot; 90 trading days &middot; starting capital {"\u20B9"}1,00,000</p>
          </div>
          <div className="flex items-center gap-5 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-500 rounded-full" /> Portfolio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-zinc-600 rounded-full border-t border-dashed border-zinc-500" /> Benchmark
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={equityData}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="portfolio" stroke="#3b82f6" fill="url(#eqGrad)" strokeWidth={2} name="Portfolio" />
            <Area type="monotone" dataKey="benchmark" stroke="#52525b" fill="transparent" strokeWidth={1.5} strokeDasharray="6 4" name="Benchmark" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Factor Attribution */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4">Factor Attribution</h2>
        <div className="space-y-3">
          {factorAttribution.map((f) => (
            <div key={f.factor} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-20 text-right shrink-0">{f.factor}</span>
              <div className="flex-1 bg-[#1e1e2e] rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${f.contribution}%`, backgroundColor: f.color }}
                />
              </div>
              <span className="text-xs font-mono text-zinc-400 w-10 shrink-0">{f.contribution}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run History */}
        <div className="lg:col-span-2 bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Run History</h2>
            <span className="text-[10px] text-zinc-500">{runs.length} of {exp.runs} runs shown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e] text-[10px] text-zinc-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-4 font-medium">Attempt</th>
                  <th className="text-center py-3 px-3 font-medium">Status</th>
                  <th className="text-right py-3 px-3 font-medium">val_bpb</th>
                  <th className="text-right py-3 px-3 font-medium">Return%</th>
                  <th className="text-right py-3 px-3 font-medium">Duration</th>
                  <th className="text-left py-3 px-4 font-medium">Sandbox</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <Link key={run.id} href={`/runs/${run.id}`} className="contents">
                    <tr className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors cursor-pointer group">
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className="text-zinc-500">#{run.attempt}</span>
                        <span className="text-zinc-600 ml-2">{run.id}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${runStatusColor[run.status]}`}>
                          {run.status === "RUNNING" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />}
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs text-zinc-400">{run.valBpb > 0 ? run.valBpb.toFixed(4) : "-"}</td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400">{run.returnPct > 0 ? `+${run.returnPct}%` : "-"}</td>
                      <td className="py-3 px-3 text-right text-xs font-mono text-zinc-400">{run.duration}</td>
                      <td className="py-3 px-4 text-xs font-mono text-zinc-500">{run.sandbox}</td>
                    </tr>
                  </Link>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Artifacts */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Artifacts</h2>
          <div className="space-y-2">
            {artifacts.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.name} className="flex items-center justify-between p-3 border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors group cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-[#0a0a0f] rounded-lg flex items-center justify-center shrink-0">
                      <Icon className={`w-4 h-4 ${a.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium group-hover:text-blue-400 transition-colors truncate">{a.name}</p>
                      <p className="text-[10px] text-zinc-600">{a.type} &middot; {a.size}</p>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
