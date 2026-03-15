"use client";

import { useState } from "react";
import {
  Rocket,
  FlaskConical,
  FileText,
  Eye,
  Zap,
  ChevronRight,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Timer,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type Environment = "research" | "paper" | "shadow-live" | "live";
type DeployStatus = "running" | "paused" | "stopped" | "promoting";

interface Deployment {
  id: string;
  strategyName: string;
  version: string;
  environment: Environment;
  status: DeployStatus;
  capital: number;
  pnl: number;
  pnlPct: number;
  uptime: string;
  deployedAt: string;
  trades: number;
  winRate: number;
}

interface HistoryEntry {
  id: string;
  strategyName: string;
  action: string;
  fromEnv?: Environment;
  toEnv: Environment;
  timestamp: string;
  actor: string;
  status: "success" | "failed" | "rolled-back";
}

// ── Mock Data ──────────────────────────────────────────────

const deployments: Deployment[] = [
  {
    id: "DEP-001",
    strategyName: "MomentumAlpha",
    version: "v2.4",
    environment: "live",
    status: "running",
    capital: 1200000,
    pnl: 47820,
    pnlPct: 3.99,
    uptime: "14d 6h",
    deployedAt: "2026-03-01T09:15:00Z",
    trades: 342,
    winRate: 62.3,
  },
  {
    id: "DEP-002",
    strategyName: "PairTrader",
    version: "v3.1",
    environment: "shadow-live",
    status: "running",
    capital: 800000,
    pnl: 12450,
    pnlPct: 1.56,
    uptime: "7d 3h",
    deployedAt: "2026-03-08T09:15:00Z",
    trades: 156,
    winRate: 58.7,
  },
  {
    id: "DEP-003",
    strategyName: "StatArb",
    version: "v1.2",
    environment: "paper",
    status: "running",
    capital: 500000,
    pnl: -8320,
    pnlPct: -1.66,
    uptime: "21d 12h",
    deployedAt: "2026-02-22T09:15:00Z",
    trades: 523,
    winRate: 51.2,
  },
  {
    id: "DEP-004",
    strategyName: "VolScalper",
    version: "v0.8",
    environment: "paper",
    status: "paused",
    capital: 300000,
    pnl: 3200,
    pnlPct: 1.07,
    uptime: "5d 8h",
    deployedAt: "2026-03-10T09:15:00Z",
    trades: 89,
    winRate: 55.1,
  },
  {
    id: "DEP-005",
    strategyName: "MeanReversion",
    version: "v2.0",
    environment: "live",
    status: "running",
    capital: 1500000,
    pnl: 82100,
    pnlPct: 5.47,
    uptime: "28d 4h",
    deployedAt: "2026-02-15T09:15:00Z",
    trades: 618,
    winRate: 64.8,
  },
  {
    id: "DEP-006",
    strategyName: "GammaScalper",
    version: "v0.1",
    environment: "research",
    status: "running",
    capital: 0,
    pnl: 0,
    pnlPct: 0,
    uptime: "2d 1h",
    deployedAt: "2026-03-13T09:15:00Z",
    trades: 0,
    winRate: 0,
  },
];

const history: HistoryEntry[] = [
  { id: "H-001", strategyName: "MomentumAlpha v2.4", action: "Promoted", fromEnv: "shadow-live", toEnv: "live", timestamp: "2026-03-01T09:15:00Z", actor: "Sankalp", status: "success" },
  { id: "H-002", strategyName: "PairTrader v3.1", action: "Promoted", fromEnv: "paper", toEnv: "shadow-live", timestamp: "2026-03-08T09:15:00Z", actor: "Sankalp", status: "success" },
  { id: "H-003", strategyName: "StatArb v1.0", action: "Deployed", toEnv: "paper", timestamp: "2026-02-22T09:15:00Z", actor: "frontier-explorer", status: "success" },
  { id: "H-004", strategyName: "BreakoutHunter v1.3", action: "Promoted", fromEnv: "shadow-live", toEnv: "live", timestamp: "2026-02-20T09:15:00Z", actor: "Sankalp", status: "rolled-back" },
  { id: "H-005", strategyName: "VolScalper v0.8", action: "Deployed", toEnv: "paper", timestamp: "2026-03-10T09:15:00Z", actor: "robustness-auditor", status: "success" },
  { id: "H-006", strategyName: "MeanReversion v2.0", action: "Promoted", fromEnv: "shadow-live", toEnv: "live", timestamp: "2026-02-15T09:15:00Z", actor: "Sankalp", status: "success" },
  { id: "H-007", strategyName: "GammaScalper v0.1", action: "Created", toEnv: "research", timestamp: "2026-03-13T09:15:00Z", actor: "frontier-explorer", status: "success" },
  { id: "H-008", strategyName: "StatArb v1.1", action: "Promoted", fromEnv: "paper", toEnv: "shadow-live", timestamp: "2026-03-05T09:15:00Z", actor: "Sankalp", status: "failed" },
];

// ── Helpers ──────────────────────────────────────────────

const envColors: Record<Environment, { bg: string; text: string; border: string; dot: string }> = {
  research: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", dot: "bg-zinc-400" },
  paper: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", dot: "bg-blue-400" },
  "shadow-live": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-400" },
  live: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
};

const statusBadge: Record<DeployStatus, { bg: string; text: string }> = {
  running: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  paused: { bg: "bg-amber-500/20", text: "text-amber-400" },
  stopped: { bg: "bg-red-500/20", text: "text-red-400" },
  promoting: { bg: "bg-purple-500/20", text: "text-purple-400" },
};

const historyStatusBadge: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  success: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  failed: { bg: "bg-red-500/20", text: "text-red-400", icon: XCircle },
  "rolled-back": { bg: "bg-amber-500/20", text: "text-amber-400", icon: AlertTriangle },
};

const pipelineStages: { env: Environment; label: string; icon: React.ElementType }[] = [
  { env: "research", label: "Research", icon: FlaskConical },
  { env: "paper", label: "Paper", icon: FileText },
  { env: "shadow-live", label: "Shadow-Live", icon: Eye },
  { env: "live", label: "Live", icon: Zap },
];

function formatCapital(n: number): string {
  if (n === 0) return "--";
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  return n.toLocaleString("en-IN");
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DeploymentsPage() {
  const [selectedEnv, setSelectedEnv] = useState<Environment | "all">("all");

  const filtered =
    selectedEnv === "all"
      ? deployments
      : deployments.filter((d) => d.environment === selectedEnv);

  const envCounts = pipelineStages.map((s) => ({
    ...s,
    count: deployments.filter((d) => d.environment === s.env).length,
  }));

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Rocket className="h-7 w-7 text-blue-500" />
            Deployments
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Strategy deployment pipeline and promotion management
          </p>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
          Deployment Pipeline
        </h2>
        <div className="flex items-center gap-0">
          {envCounts.map((stage, idx) => {
            const ec = envColors[stage.env];
            const isActive = selectedEnv === stage.env;
            return (
              <div key={stage.env} className="flex items-center flex-1">
                <button
                  onClick={() =>
                    setSelectedEnv(
                      selectedEnv === stage.env ? "all" : stage.env,
                    )
                  }
                  className={`flex-1 group relative rounded-xl border p-4 transition-all ${
                    isActive
                      ? `${ec.border} ${ec.bg} border-2`
                      : "border-[#1e1e2e] hover:border-[#2a2a3a] hover:bg-[#16161f]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg ${ec.bg} flex items-center justify-center`}
                    >
                      <stage.icon className={`h-5 w-5 ${ec.text}`} />
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-medium ${ec.text}`}>
                        {stage.label}
                      </p>
                      <p className="text-lg font-bold text-white">
                        {stage.count}
                      </p>
                    </div>
                  </div>
                  {/* Active indicator */}
                  {deployments.some(
                    (d) =>
                      d.environment === stage.env && d.status === "running",
                  ) && (
                    <span className="absolute top-2 right-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span
                          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ec.dot} opacity-75`}
                        />
                        <span
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ec.dot}`}
                        />
                      </span>
                    </span>
                  )}
                </button>
                {idx < envCounts.length - 1 && (
                  <ChevronRight className="h-5 w-5 text-zinc-700 shrink-0 mx-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Deployments Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-300">
            Active Deployments
            {selectedEnv !== "all" && (
              <span className="ml-2 text-xs text-zinc-500 font-normal">
                Filtered: {selectedEnv}
                <button
                  onClick={() => setSelectedEnv("all")}
                  className="ml-2 text-blue-400 hover:text-blue-300"
                >
                  Clear
                </button>
              </span>
            )}
          </h2>
          <span className="text-xs text-zinc-500">
            {filtered.length} deployment{filtered.length !== 1 && "s"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((dep) => {
            const ec = envColors[dep.environment];
            const sb = statusBadge[dep.status];

            return (
              <div
                key={dep.id}
                className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 hover:bg-[#16161f] transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {dep.strategyName}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {dep.version} &middot; {dep.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${ec.bg} ${ec.text} ${ec.border}`}
                    >
                      {dep.environment}
                    </span>
                  </div>
                </div>

                {/* Status & Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-zinc-600">Status</p>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded mt-0.5 ${sb.bg} ${sb.text}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {dep.status.charAt(0).toUpperCase() +
                        dep.status.slice(1)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Capital</p>
                    <p className="text-sm font-bold font-mono text-white mt-0.5">
                      {formatCapital(dep.capital)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">P&L</p>
                    <p
                      className={`text-sm font-bold font-mono flex items-center gap-1 mt-0.5 ${dep.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {dep.pnl >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {dep.pnl !== 0
                        ? `${dep.pnl >= 0 ? "+" : ""}${dep.pnl.toLocaleString("en-IN")}`
                        : "--"}
                      {dep.pnlPct !== 0 && (
                        <span className="text-xs">
                          ({Math.abs(dep.pnlPct).toFixed(2)}%)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Uptime</p>
                    <p className="text-sm font-mono text-zinc-300 flex items-center gap-1 mt-0.5">
                      <Timer className="h-3 w-3" />
                      {dep.uptime}
                    </p>
                  </div>
                </div>

                {/* Extra stats bar */}
                <div className="flex items-center gap-4 pt-3 border-t border-[#1e1e2e] text-xs text-zinc-500 mb-4">
                  <span>
                    Trades:{" "}
                    <span className="text-zinc-300 font-mono">
                      {dep.trades}
                    </span>
                  </span>
                  <span>
                    Win Rate:{" "}
                    <span
                      className={`font-mono ${dep.winRate >= 55 ? "text-emerald-400" : dep.winRate >= 50 ? "text-amber-400" : "text-red-400"}`}
                    >
                      {dep.winRate > 0 ? `${dep.winRate}%` : "--"}
                    </span>
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {dep.environment !== "live" && (
                    <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Promote
                    </button>
                  )}
                  {dep.status === "running" ? (
                    <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors">
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                  ) : (
                    <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Deployment History</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Recent deployment actions and promotions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Strategy</th>
                <th className="text-left py-3 px-3 font-medium">Action</th>
                <th className="text-left py-3 px-3 font-medium">
                  Environment
                </th>
                <th className="text-left py-3 px-3 font-medium">Actor</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-right py-3 px-5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const sb = historyStatusBadge[h.status];
                const StatusIcon = sb.icon;
                return (
                  <tr
                    key={h.id}
                    className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors"
                  >
                    <td className="py-3 px-5 font-medium">
                      {h.strategyName}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">{h.action}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        {h.fromEnv && (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded ${envColors[h.fromEnv].bg} ${envColors[h.fromEnv].text}`}
                            >
                              {h.fromEnv}
                            </span>
                            <ChevronRight className="h-3 w-3 text-zinc-600" />
                          </>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded ${envColors[h.toEnv].bg} ${envColors[h.toEnv].text}`}
                        >
                          {h.toEnv}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-zinc-400">
                      {h.actor}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${sb.bg} ${sb.text}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {h.status}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right text-xs text-zinc-500 font-mono">
                      {formatDate(h.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
