"use client";

import {
  Coins,
  TrendingUp,
  Users,
  Waypoints,
  Clock,
  Unlock,
  CreditCard,
  Zap,
  Minus,
  Plus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Mock Data ──────────────────────────────────────────────

const balances = {
  testing: { total: 48250, reserved: 12000, available: 36250 },
  liveOps: { total: 125600, reserved: 35000, available: 90600 },
};

const spendOverTime = [
  { date: "Feb 14", testing: 820, liveOps: 2100 },
  { date: "Feb 15", testing: 1050, liveOps: 1850 },
  { date: "Feb 16", testing: 640, liveOps: 2400 },
  { date: "Feb 17", testing: 920, liveOps: 1950 },
  { date: "Feb 18", testing: 1200, liveOps: 2800 },
  { date: "Feb 19", testing: 780, liveOps: 2200 },
  { date: "Feb 20", testing: 1100, liveOps: 3100 },
  { date: "Feb 21", testing: 950, liveOps: 2650 },
  { date: "Feb 22", testing: 1350, liveOps: 2900 },
  { date: "Feb 23", testing: 680, liveOps: 2050 },
  { date: "Feb 24", testing: 1420, liveOps: 3200 },
  { date: "Feb 25", testing: 1100, liveOps: 2750 },
  { date: "Feb 26", testing: 890, liveOps: 2400 },
  { date: "Feb 27", testing: 1250, liveOps: 3050 },
  { date: "Feb 28", testing: 1080, liveOps: 2600 },
  { date: "Mar 1", testing: 1500, liveOps: 3400 },
  { date: "Mar 2", testing: 720, liveOps: 2150 },
  { date: "Mar 3", testing: 1300, liveOps: 3100 },
  { date: "Mar 4", testing: 960, liveOps: 2550 },
  { date: "Mar 5", testing: 1450, liveOps: 3350 },
  { date: "Mar 6", testing: 1150, liveOps: 2800 },
  { date: "Mar 7", testing: 880, liveOps: 2200 },
  { date: "Mar 8", testing: 1600, liveOps: 3500 },
  { date: "Mar 9", testing: 1200, liveOps: 2900 },
  { date: "Mar 10", testing: 1050, liveOps: 2700 },
  { date: "Mar 11", testing: 1380, liveOps: 3150 },
  { date: "Mar 12", testing: 920, liveOps: 2450 },
  { date: "Mar 13", testing: 1550, liveOps: 3600 },
  { date: "Mar 14", testing: 1100, liveOps: 2850 },
  { date: "Mar 15", testing: 480, liveOps: 1200 },
];

const topSpenders = [
  { name: "Sankalp", role: "Owner", credits: 28400, pct: 32.1 },
  { name: "frontier-explorer-agent", role: "Agent", credits: 22150, pct: 25.0 },
  { name: "robustness-auditor", role: "Agent", credits: 18300, pct: 20.7 },
  { name: "Priya", role: "Collaborator", credits: 12600, pct: 14.2 },
  { name: "divergence-investigator", role: "Agent", credits: 7050, pct: 8.0 },
];

const topSwarms = [
  { name: "MomentumAlpha Research Swarm", template: "Frontier Explorer", credits: 18500, runs: 42 },
  { name: "PairTrader Validation", template: "Robustness Auditor", credits: 14200, runs: 28 },
  { name: "StatArb Discovery", template: "Frontier Explorer", credits: 11800, runs: 35 },
  { name: "Options Vol Surface Analysis", template: "Divergence Investigator", credits: 9400, runs: 22 },
  { name: "MeanReversion Stress Test", template: "Robustness Auditor", credits: 7600, runs: 19 },
];

type LedgerType = "RESERVE" | "DEBIT" | "RELEASE" | "TOPUP";

interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: number;
  description: string;
  timestamp: string;
  balanceAfter: number;
}

const ledgerEntries: LedgerEntry[] = [
  { id: "LED-001", type: "DEBIT", amount: -1200, description: "MomentumAlpha Swarm Run #42 - 3 agents, 45min compute", timestamp: "2026-03-15T10:30:00Z", balanceAfter: 172650 },
  { id: "LED-002", type: "RESERVE", amount: -5000, description: "Reserved for PairTrader shadow-live deployment (7 days)", timestamp: "2026-03-15T09:15:00Z", balanceAfter: 173850 },
  { id: "LED-003", type: "RELEASE", amount: 3200, description: "Released unused reservation from StatArb paper run", timestamp: "2026-03-15T08:00:00Z", balanceAfter: 178850 },
  { id: "LED-004", type: "DEBIT", amount: -800, description: "Robustness Auditor - StatArb v1.2 validation suite", timestamp: "2026-03-14T22:10:00Z", balanceAfter: 175650 },
  { id: "LED-005", type: "TOPUP", amount: 25000, description: "Manual top-up by Sankalp (Razorpay #TXN-4829)", timestamp: "2026-03-14T18:00:00Z", balanceAfter: 176450 },
  { id: "LED-006", type: "DEBIT", amount: -2400, description: "Frontier Explorer - Options VolSurface analysis", timestamp: "2026-03-14T15:30:00Z", balanceAfter: 151450 },
  { id: "LED-007", type: "RESERVE", amount: -8000, description: "Reserved for MomentumAlpha live deployment (14 days)", timestamp: "2026-03-14T09:15:00Z", balanceAfter: 153850 },
  { id: "LED-008", type: "DEBIT", amount: -1800, description: "Divergence Investigator - MeanReversion signal analysis", timestamp: "2026-03-13T20:45:00Z", balanceAfter: 163650 },
  { id: "LED-009", type: "RELEASE", amount: 4500, description: "Released reservation from completed VolScalper paper run", timestamp: "2026-03-13T15:00:00Z", balanceAfter: 159150 },
  { id: "LED-010", type: "DEBIT", amount: -3100, description: "Robustness Auditor - MomentumAlpha stress test suite", timestamp: "2026-03-13T11:20:00Z", balanceAfter: 162250 },
];

interface Reservation {
  id: string;
  description: string;
  amount: number;
  createdAt: string;
  expiresAt: string;
  deployment: string;
}

const reservations: Reservation[] = [
  { id: "RES-001", description: "MomentumAlpha live deployment", amount: 8000, createdAt: "2026-03-14T09:15:00Z", expiresAt: "2026-03-28T09:15:00Z", deployment: "DEP-001" },
  { id: "RES-002", description: "PairTrader shadow-live deployment", amount: 5000, createdAt: "2026-03-15T09:15:00Z", expiresAt: "2026-03-22T09:15:00Z", deployment: "DEP-002" },
  { id: "RES-003", description: "StatArb paper infrastructure", amount: 2000, createdAt: "2026-03-12T09:15:00Z", expiresAt: "2026-04-12T09:15:00Z", deployment: "DEP-003" },
  { id: "RES-004", description: "MeanReversion live ops buffer", amount: 20000, createdAt: "2026-03-01T09:15:00Z", expiresAt: "2026-03-31T09:15:00Z", deployment: "DEP-005" },
  { id: "RES-005", description: "GammaScalper research sandbox", amount: 12000, createdAt: "2026-03-13T09:15:00Z", expiresAt: "2026-03-20T09:15:00Z", deployment: "DEP-006" },
];

// ── Helpers ──────────────────────────────────────────────

const ledgerTypeConfig: Record<LedgerType, { bg: string; text: string; icon: React.ElementType }> = {
  RESERVE: { bg: "bg-blue-500/20", text: "text-blue-400", icon: Clock },
  DEBIT: { bg: "bg-red-500/20", text: "text-red-400", icon: Minus },
  RELEASE: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: Unlock },
  TOPUP: { bg: "bg-purple-500/20", text: "text-purple-400", icon: Plus },
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-400">{p.name}:</span>
          <span className="font-mono font-medium text-white">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Component ──────────────────────────────────────────────

export default function CreditsPage() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Coins className="h-7 w-7 text-amber-500" />
            Credits &amp; Economics
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Workspace credit balance, spend tracking, and reservations
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-600 transition-colors shadow-lg shadow-purple-500/20">
          <CreditCard className="h-4 w-4" />
          Top Up Credits
        </button>
      </div>

      {/* Balance Hero Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Testing Credits */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#111118] via-[#111118] to-blue-500/10 p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Testing Credits</p>
                <p className="text-xs text-zinc-600">Research, backtests, paper trading</p>
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-blue-400 mb-3">
              {balances.testing.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-zinc-500">Available</span>
                <p className="font-mono text-white font-medium">{balances.testing.available.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-zinc-500">Reserved</span>
                <p className="font-mono text-blue-400/70">{balances.testing.reserved.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
              <div className="h-full rounded-full bg-blue-500/50" style={{ width: `${(balances.testing.reserved / balances.testing.total) * 100}%` }} />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">{((balances.testing.reserved / balances.testing.total) * 100).toFixed(1)}% reserved</p>
          </div>
        </div>

        {/* Live Ops Credits */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#111118] via-[#111118] to-purple-500/10 p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Live Ops Credits</p>
                <p className="text-xs text-zinc-600">Shadow-live, live deployments, execution</p>
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-purple-400 mb-3">
              {balances.liveOps.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-zinc-500">Available</span>
                <p className="font-mono text-white font-medium">{balances.liveOps.available.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-zinc-500">Reserved</span>
                <p className="font-mono text-purple-400/70">{balances.liveOps.reserved.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
              <div className="h-full rounded-full bg-purple-500/50" style={{ width: `${(balances.liveOps.reserved / balances.liveOps.total) * 100}%` }} />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">{((balances.liveOps.reserved / balances.liveOps.total) * 100).toFixed(1)}% reserved</p>
          </div>
        </div>
      </div>

      {/* Spend Over Time Chart */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Spend Over Time</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Daily credit consumption (last 30 days)</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-blue-500" />
              Testing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-purple-500" />
              Live Ops
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={spendOverTime}>
            <defs>
              <linearGradient id="colorTesting" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLiveOps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={{ stroke: "#1e1e2e" }}
              interval={4}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={{ stroke: "#1e1e2e" }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="testing"
              name="Testing"
              stroke="#3b82f6"
              fill="url(#colorTesting)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="liveOps"
              name="Live Ops"
              stroke="#a855f7"
              fill="url(#colorLiveOps)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two column: Spenders + Swarms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Spenders */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-semibold">Top Spenders</h2>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Credit consumption by member</p>
          </div>
          <div className="divide-y divide-[#1e1e2e]">
            {topSpenders.map((s, idx) => (
              <div key={s.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#16161f] transition-colors">
                <span className="text-xs font-bold text-zinc-600 w-5">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.name}</p>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${s.role === "Agent" ? "bg-purple-500/20 text-purple-400" : s.role === "Owner" ? "bg-blue-500/20 text-blue-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                    {s.role}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-white">{s.credits.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">{s.pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Swarms */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-semibold">Top Swarms</h2>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Credit consumption by swarm</p>
          </div>
          <div className="divide-y divide-[#1e1e2e]">
            {topSwarms.map((s, idx) => (
              <div key={s.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#16161f] transition-colors">
                <span className="text-xs font-bold text-zinc-600 w-5">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.name}</p>
                  <span className="text-[10px] text-zinc-500">{s.template} &middot; {s.runs} runs</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-white">{s.credits.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Ledger Entries */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Recent Ledger</h2>
          <p className="text-xs text-zinc-500 mt-0.5">All credit transactions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Type</th>
                <th className="text-right py-3 px-3 font-medium">Amount</th>
                <th className="text-left py-3 px-3 font-medium">Description</th>
                <th className="text-right py-3 px-3 font-medium">Balance After</th>
                <th className="text-right py-3 px-5 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.map((e) => {
                const cfg = ledgerTypeConfig[e.type];
                const LedgerIcon = cfg.icon;
                return (
                  <tr key={e.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                        <LedgerIcon className="h-3 w-3" />
                        {e.type}
                      </span>
                    </td>
                    <td className={`py-3 px-3 text-right font-mono font-bold ${e.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {e.amount >= 0 ? "+" : ""}{e.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-xs text-zinc-400 max-w-md truncate">{e.description}</td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">{e.balanceAfter.toLocaleString()}</td>
                    <td className="py-3 px-5 text-right text-xs text-zinc-500 font-mono">{formatTimestamp(e.timestamp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Reservations */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Active Reservations</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{reservations.length} active credit reservations</p>
          </div>
          <span className="text-xs text-zinc-500">
            Total reserved:{" "}
            <span className="font-mono font-bold text-amber-400">
              {reservations.reduce((s, r) => s + r.amount, 0).toLocaleString()}
            </span>
          </span>
        </div>
        <div className="divide-y divide-[#1e1e2e]">
          {reservations.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#16161f] transition-colors">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{r.description}</p>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    <span className="font-mono">{r.id}</span>
                    <span>Created {formatDate(r.createdAt)}</span>
                    <span>Expires {formatDate(r.expiresAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold font-mono text-amber-400">
                  {r.amount.toLocaleString()}
                </span>
                <button className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                  <Unlock className="h-3 w-3" />
                  Release
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
