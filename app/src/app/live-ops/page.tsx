"use client";

import {
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Zap,
  Timer,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────

interface LiveStrategy {
  id: string;
  name: string;
  version: string;
  status: "running" | "paused";
  capital: number;
  pnl: number;
  pnlPct: number;
  trades: number;
  winRate: number;
  sharpe: number;
  maxDrawdown: number;
  uptime: string;
}

interface RecentOrder {
  id: string;
  strategy: string;
  symbol: string;
  type: "BUY" | "SELL";
  qty: number;
  price: number;
  status: "COMPLETE" | "OPEN" | "PENDING" | "REJECTED" | "CANCELLED";
  time: string;
}

interface DivergenceAlert {
  strategy: string;
  expected: number;
  actual: number;
  divergence: number;
  severity: "warning" | "critical";
}

// ── Mock Data ──────────────────────────────────────────────

const liveStrategies: LiveStrategy[] = [
  {
    id: "LS-001",
    name: "MomentumAlpha",
    version: "v2.4",
    status: "running",
    capital: 1200000,
    pnl: 47820,
    pnlPct: 3.99,
    trades: 342,
    winRate: 62.3,
    sharpe: 2.14,
    maxDrawdown: -1.8,
    uptime: "14d 6h",
  },
  {
    id: "LS-002",
    name: "MeanReversion",
    version: "v2.0",
    status: "running",
    capital: 1500000,
    pnl: 82100,
    pnlPct: 5.47,
    trades: 618,
    winRate: 64.8,
    sharpe: 2.56,
    maxDrawdown: -2.1,
    uptime: "28d 4h",
  },
  {
    id: "LS-003",
    name: "PairTrader",
    version: "v3.1",
    status: "running",
    capital: 800000,
    pnl: 12450,
    pnlPct: 1.56,
    trades: 156,
    winRate: 58.7,
    sharpe: 1.45,
    maxDrawdown: -3.2,
    uptime: "7d 3h",
  },
  {
    id: "LS-004",
    name: "VolScalper",
    version: "v0.8",
    status: "paused",
    capital: 300000,
    pnl: 3200,
    pnlPct: 1.07,
    trades: 89,
    winRate: 55.1,
    sharpe: 0.92,
    maxDrawdown: -4.5,
    uptime: "5d 8h (paused)",
  },
];

const liveVsExpected = [
  { name: "MomentumAlpha", live: 47820, expected: 52400 },
  { name: "MeanReversion", live: 82100, expected: 78500 },
  { name: "PairTrader", live: 12450, expected: 18200 },
  { name: "VolScalper", live: 3200, expected: 5100 },
];

const recentOrders: RecentOrder[] = [
  { id: "LO-001", strategy: "MomentumAlpha", symbol: "RELIANCE", type: "BUY", qty: 50, price: 2542.10, status: "COMPLETE", time: "10:32:15" },
  { id: "LO-002", strategy: "MeanReversion", symbol: "HDFCBANK", type: "SELL", qty: 100, price: 1698.50, status: "COMPLETE", time: "10:30:44" },
  { id: "LO-003", strategy: "PairTrader", symbol: "TCS", type: "BUY", qty: 25, price: 3878.20, status: "COMPLETE", time: "10:28:33" },
  { id: "LO-004", strategy: "PairTrader", symbol: "INFY", type: "SELL", qty: 30, price: 1510.80, status: "COMPLETE", time: "10:28:30" },
  { id: "LO-005", strategy: "MomentumAlpha", symbol: "ICICIBANK", type: "BUY", qty: 75, price: 1175.00, status: "OPEN", time: "10:25:12" },
  { id: "LO-006", strategy: "MeanReversion", symbol: "SBIN", type: "BUY", qty: 200, price: 577.50, status: "COMPLETE", time: "10:22:01" },
  { id: "LO-007", strategy: "MomentumAlpha", symbol: "TATAMOTORS", type: "SELL", qty: 100, price: 674.30, status: "REJECTED", time: "10:18:45" },
  { id: "LO-008", strategy: "MeanReversion", symbol: "BAJFINANCE", type: "BUY", qty: 15, price: 7128.00, status: "COMPLETE", time: "10:15:33" },
  { id: "LO-009", strategy: "PairTrader", symbol: "AXISBANK", type: "SELL", qty: 50, price: 1082.40, status: "COMPLETE", time: "10:12:18" },
  { id: "LO-010", strategy: "MomentumAlpha", symbol: "NIFTY 25000CE", type: "BUY", qty: 25, price: 312.80, status: "COMPLETE", time: "10:08:55" },
  { id: "LO-011", strategy: "MeanReversion", symbol: "SUNPHARMA", type: "BUY", qty: 80, price: 1425.60, status: "PENDING", time: "10:05:22" },
  { id: "LO-012", strategy: "PairTrader", symbol: "KOTAKBANK", type: "SELL", qty: 40, price: 1845.00, status: "COMPLETE", time: "10:02:10" },
  { id: "LO-013", strategy: "MomentumAlpha", symbol: "LT", type: "BUY", qty: 30, price: 3520.50, status: "COMPLETE", time: "09:58:44" },
  { id: "LO-014", strategy: "MeanReversion", symbol: "WIPRO", type: "SELL", qty: 150, price: 445.20, status: "COMPLETE", time: "09:55:30" },
  { id: "LO-015", strategy: "MomentumAlpha", symbol: "RELIANCE", type: "SELL", qty: 25, price: 2545.00, status: "CANCELLED", time: "09:52:18" },
];

const divergenceAlerts: DivergenceAlert[] = [
  { strategy: "MomentumAlpha", expected: 52400, actual: 47820, divergence: 8.7, severity: "warning" },
  { strategy: "PairTrader", expected: 18200, actual: 12450, divergence: 31.6, severity: "critical" },
];

// ── Helpers ──────────────────────────────────────────────

const orderStatusColor: Record<string, string> = {
  COMPLETE: "bg-emerald-500/20 text-emerald-400",
  OPEN: "bg-blue-500/20 text-blue-400",
  PENDING: "bg-amber-500/20 text-amber-400",
  REJECTED: "bg-red-500/20 text-red-400",
  CANCELLED: "bg-zinc-500/20 text-zinc-400",
};

function formatCapital(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  return n.toLocaleString("en-IN");
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
          <span className="font-mono font-medium text-white">{p.value >= 0 ? "+" : ""}{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ── Component ──────────────────────────────────────────────

export default function LiveOpsPage() {
  const totalCapital = liveStrategies.reduce((s, ls) => s + ls.capital, 0);
  const totalPnl = liveStrategies.reduce((s, ls) => s + ls.pnl, 0);
  const totalTrades = liveStrategies.reduce((s, ls) => s + ls.trades, 0);
  const runningCount = liveStrategies.filter((s) => s.status === "running").length;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="h-7 w-7 text-emerald-500" />
            Live Operations
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time monitoring of live strategy execution
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          {runningCount} strategies running
        </div>
      </div>

      {/* Divergence Alerts */}
      {divergenceAlerts.length > 0 && (
        <div className="space-y-2">
          {divergenceAlerts.map((alert) => (
            <div
              key={alert.strategy}
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                alert.severity === "critical"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 shrink-0 ${
                  alert.severity === "critical" ? "text-red-400" : "text-amber-400"
                }`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  <span
                    className={
                      alert.severity === "critical" ? "text-red-400" : "text-amber-400"
                    }
                  >
                    {alert.divergence.toFixed(1)}% divergence
                  </span>{" "}
                  detected in {alert.strategy}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Expected: +{alert.expected.toLocaleString()} | Actual: +{alert.actual.toLocaleString()}
                </p>
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                  alert.severity === "critical"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {alert.severity}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Capital", value: formatCapital(totalCapital), icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Total P&L", value: `+${totalPnl.toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Total Trades", value: totalTrades.toString(), icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "Active Strategies", value: `${runningCount} / ${liveStrategies.length}`, icon: Eye, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <span className="text-xs text-zinc-600 uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Live Strategy Cards */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Live Strategies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {liveStrategies.map((strat) => (
            <div
              key={strat.id}
              className={`rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 transition-all hover:bg-[#16161f] ${
                strat.status === "paused" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold">{strat.name}</h3>
                  <p className="text-xs text-zinc-500">{strat.version}</p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                    strat.status === "running"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {strat.status}
                </span>
              </div>

              {/* P&L Hero */}
              <div className="mb-4">
                <p
                  className={`text-2xl font-bold font-mono flex items-center gap-1 ${
                    strat.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {strat.pnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {strat.pnl >= 0 ? "+" : ""}{strat.pnl.toLocaleString("en-IN")}
                </p>
                <p className={`text-xs font-mono ${strat.pnlPct >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {strat.pnlPct >= 0 ? "+" : ""}{strat.pnlPct.toFixed(2)}% on {formatCapital(strat.capital)}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Win Rate</span>
                  <span className={`font-mono ${strat.winRate >= 60 ? "text-emerald-400" : "text-zinc-300"}`}>{strat.winRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Sharpe</span>
                  <span className={`font-mono ${strat.sharpe >= 2 ? "text-emerald-400" : strat.sharpe >= 1 ? "text-amber-400" : "text-red-400"}`}>{strat.sharpe.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Trades</span>
                  <span className="font-mono text-zinc-300">{strat.trades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Max DD</span>
                  <span className="font-mono text-red-400">{strat.maxDrawdown}%</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#1e1e2e] flex items-center gap-1 text-xs text-zinc-500">
                <Timer className="h-3 w-3" />
                {strat.uptime}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live vs Expected Chart */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Live vs Expected P&L</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Comparing actual live P&L against shadow-live expectations</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-emerald-500" />
              Live
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-blue-500" />
              Expected
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={liveVsExpected} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis
              dataKey="name"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={{ stroke: "#1e1e2e" }}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={{ stroke: "#1e1e2e" }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="live" name="Live" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
            <Bar dataKey="expected" name="Expected" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Order Flow Timeline */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Order Flow</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{recentOrders.length} recent orders across strategies</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {recentOrders.filter((o) => o.status === "COMPLETE").length} filled
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Time</th>
                <th className="text-left py-3 px-3 font-medium">Strategy</th>
                <th className="text-left py-3 px-3 font-medium">Symbol</th>
                <th className="text-center py-3 px-3 font-medium">Side</th>
                <th className="text-right py-3 px-3 font-medium">Qty</th>
                <th className="text-right py-3 px-3 font-medium">Price</th>
                <th className="text-center py-3 px-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                  <td className="py-2.5 px-5 font-mono text-xs text-zinc-400">{o.time}</td>
                  <td className="py-2.5 px-3 text-xs text-zinc-300">{o.strategy}</td>
                  <td className="py-2.5 px-3 font-mono font-medium">{o.symbol}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${o.type === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {o.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{o.qty}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{o.price.toFixed(2)}</td>
                  <td className="py-2.5 px-5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${orderStatusColor[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
