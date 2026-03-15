"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, StopCircle, Cpu, Clock, Activity, Hash,
  FileText, Download, Heart, BarChart3, Terminal, AlertCircle,
  Package, Image, FileSpreadsheet, Code2, CheckCircle, XCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const liveMetrics = [
  { label: "Current Return", value: "+18.4%", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "Current Alpha", value: "+7.2%", color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "Sharpe Ratio", value: "2.18", color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "Max Drawdown", value: "-4.1%", color: "text-red-400", bg: "bg-red-500/10" },
  { label: "Win Rate", value: "64.2%", color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "Total Trades", value: "342", color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

const pnlData = Array.from({ length: 40 }, (_, i) => ({
  step: i + 1,
  pnl: Math.round(50000 + i * 420 + Math.sin(i / 4) * 2200 + Math.cos(i / 7) * 1400 + Math.random() * 800),
}));

// 20 events for the timeline
const events: Array<{ time: string; type: "LOG" | "METRIC" | "HEARTBEAT" | "ERROR" | "ARTIFACT"; message: string }> = [
  { time: "09:16:30", type: "LOG", message: "Walk-forward pass #3 complete. Best sharpe: 2.41" },
  { time: "09:16:28", type: "ARTIFACT", message: "Generated equity_curve_pass3.png (340 KB)" },
  { time: "09:16:12", type: "HEARTBEAT", message: "sandbox=sb-frontier-001 cpu=34% mem=2.1GB disk=12%" },
  { time: "09:15:45", type: "METRIC", message: "epoch=8 train_sharpe=2.42 test_sharpe=2.28 alpha=12.1%" },
  { time: "09:15:30", type: "LOG", message: "Parameter optimization converged after 45 iterations" },
  { time: "09:15:01", type: "METRIC", message: "epoch=7 train_sharpe=2.31 test_sharpe=2.18 alpha=11.4%" },
  { time: "09:14:55", type: "LOG", message: "Cross-validation fold 3/5 complete — RMSE: 0.0312" },
  { time: "09:14:37", type: "LOG", message: "Test window: 2024-07-01 to 2025-12-31" },
  { time: "09:14:36", type: "LOG", message: "Training window: 2020-01-01 to 2024-06-30" },
  { time: "09:14:33", type: "LOG", message: "Loading historical data: NIFTY50 constituents 2020-2026" },
  { time: "09:14:32", type: "LOG", message: "Starting walk-forward optimization pass #3" },
  { time: "09:10:15", type: "ERROR", message: "Warning: Missing data for ADANIENT 2020-03-23 to 2020-03-25 (filled forward)" },
  { time: "09:10:12", type: "HEARTBEAT", message: "sandbox=sb-frontier-001 cpu=28% mem=1.8GB disk=10%" },
  { time: "09:10:00", type: "METRIC", message: "epoch=6 train_sharpe=2.22 test_sharpe=2.08 alpha=10.8%" },
  { time: "09:08:30", type: "LOG", message: "Walk-forward pass #2 complete. Sharpe: 2.28" },
  { time: "09:08:28", type: "ARTIFACT", message: "Generated interim_results_pass2.json (1.2 MB)" },
  { time: "09:05:00", type: "HEARTBEAT", message: "sandbox=sb-frontier-001 cpu=41% mem=2.0GB disk=11%" },
  { time: "09:02:15", type: "METRIC", message: "epoch=4 train_sharpe=2.05 test_sharpe=1.92 alpha=9.1%" },
  { time: "09:00:05", type: "LOG", message: "Sandbox sb-frontier-001 environment validated. Python 3.11, GPU: A10G" },
  { time: "09:00:00", type: "LOG", message: "Run started. Sandbox sb-frontier-001 created and provisioned." },
];

const artifacts = [
  { name: "equity_curve_pass3.png", size: "340 KB", type: "Chart", icon: Image, color: "text-blue-400" },
  { name: "interim_results_pass2.json", size: "1.2 MB", type: "Results", icon: FileText, color: "text-purple-400" },
  { name: "trade_log_pass2.csv", size: "456 KB", type: "Trades", icon: FileSpreadsheet, color: "text-amber-400" },
  { name: "parameter_grid.json", size: "89 KB", type: "Config", icon: Code2, color: "text-cyan-400" },
];

const eventTypeConfig: Record<string, { bg: string; text: string; icon: typeof Terminal; border: string }> = {
  LOG: { bg: "bg-zinc-500/20", text: "text-zinc-400", icon: Terminal, border: "border-zinc-500/30" },
  METRIC: { bg: "bg-blue-500/20", text: "text-blue-400", icon: BarChart3, border: "border-blue-500/30" },
  HEARTBEAT: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: Heart, border: "border-emerald-500/30" },
  ERROR: { bg: "bg-red-500/20", text: "text-red-400", icon: AlertCircle, border: "border-red-500/30" },
  ARTIFACT: { bg: "bg-purple-500/20", text: "text-purple-400", icon: Package, border: "border-purple-500/30" },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 shadow-xl">
      <p className="text-[10px] text-zinc-500 mb-1 font-mono">Step {label}</p>
      <p className="text-xs font-medium font-mono text-emerald-400">{"\u20B9"}{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <Link href="/runs" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Runs
      </Link>

      {/* Status Banner */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold tracking-tight">Momentum Alpha v4</h1>
              <span className="text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> RUNNING
              </span>
            </div>
            <div className="flex items-center gap-5 text-xs text-zinc-500">
              <span className="font-mono">{id}</span>
              <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> sb-frontier-001</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 2h 34m elapsed</span>
              <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> Step 3/5</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Attempt 3</span>
              <span className="px-2 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/20 rounded text-[10px] font-medium">Research</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Created 2026-03-15 09:00:00 &middot; Last heartbeat 12s ago</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 border border-red-500/30 text-sm text-red-400 rounded-lg hover:bg-red-500/30 transition-colors shrink-0">
            <StopCircle className="w-4 h-4" /> Terminate Run
          </button>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {liveMetrics.map((m) => (
          <div key={m.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 relative overflow-hidden">
            {/* Subtle "updating" shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-pulse pointer-events-none" />
            <p className={`text-xl font-bold font-mono ${m.color} relative`}>{m.value}</p>
            <p className="text-[11px] text-zinc-500 mt-1 relative">{m.label}</p>
          </div>
        ))}
      </div>

      {/* PnL Chart */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Live PnL Curve</h2>
          <span className="text-[10px] text-zinc-500 font-mono">40 steps &middot; updated 12s ago</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={pnlData}>
            <defs>
              <linearGradient id="runPnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="step" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="pnl" stroke="#10b981" fill="url(#runPnlGrad)" strokeWidth={2} name="PnL" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Timeline — 2 cols */}
        <div className="lg:col-span-2 bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Event Timeline</h2>
            <span className="text-[10px] text-zinc-500">{events.length} events</span>
          </div>

          <div className="relative max-h-[520px] overflow-y-auto pr-2">
            {/* Center line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#1e1e2e] -translate-x-0.5" />

            {events.map((event, i) => {
              const cfg = eventTypeConfig[event.type];
              const Icon = cfg.icon;
              const isLeft = i % 2 === 0;

              return (
                <div key={i} className={`relative flex items-start mb-4 ${isLeft ? "pr-[52%]" : "pl-[52%]"}`}>
                  {/* Center dot */}
                  <div className="absolute left-1/2 top-2 -translate-x-1/2 z-10">
                    <div className={`w-7 h-7 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                      <Icon className={`w-3 h-3 ${cfg.text}`} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className={`w-full p-3 rounded-lg bg-[#0a0a0f] border border-[#1e1e2e] hover:border-[#2a2a3a] transition-colors ${isLeft ? "text-right" : "text-left"}`}>
                    <div className={`flex items-center gap-2 mb-1 ${isLeft ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.text}`}>{event.type}</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{event.time}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono leading-relaxed break-all">{event.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column — Artifacts */}
        <div className="space-y-6">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4">Artifact Gallery</h2>
            <div className="grid grid-cols-2 gap-3">
              {artifacts.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.name} className="p-3 border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors group cursor-pointer text-center">
                    <div className="w-10 h-10 bg-[#0a0a0f] rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Icon className={`w-5 h-5 ${a.color}`} />
                    </div>
                    <p className="text-[11px] font-medium group-hover:text-blue-400 transition-colors truncate">{a.name}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{a.type} &middot; {a.size}</p>
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Download className="w-3.5 h-3.5 text-zinc-500 mx-auto" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sandbox Info Card */}
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4">Sandbox Info</h2>
            <div className="space-y-3 text-xs">
              {[
                { label: "Sandbox ID", value: "sb-frontier-001" },
                { label: "Environment", value: "Research" },
                { label: "Runtime", value: "Python 3.11 / GPU A10G" },
                { label: "Created", value: "2026-03-15 09:00:00" },
                { label: "Memory", value: "2.1 GB / 16 GB" },
                { label: "CPU Usage", value: "34%" },
                { label: "Disk", value: "12% (2.4 GB / 20 GB)" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-zinc-500">{row.label}</span>
                  <span className="text-zinc-300 font-mono">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
