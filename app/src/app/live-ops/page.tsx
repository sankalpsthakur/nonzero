"use client";

import {
  Radio, Activity, TrendingUp, TrendingDown, AlertTriangle,
  Clock, ArrowUpRight, ArrowDownRight, Eye
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell,
} from "recharts";

const positionSummary = {
  totalPositions: 8,
  longPositions: 5,
  shortPositions: 3,
  totalExposure: 3245000,
  netPnl: 23215,
  netPnlPct: 0.72,
};

const liveStrategies = [
  { name: "Momentum Alpha v3", status: "ACTIVE", positions: 4, pnl: 42350, pnlPct: 8.47, capital: 500000, trades: 12, winRate: 67, lastSignal: "BUY RELIANCE @ 2538", lastSignalTime: "5 min ago" },
  { name: "Pair Trader NIFTY", status: "ACTIVE", positions: 2, pnl: -8450, pnlPct: -4.23, capital: 200000, trades: 6, winRate: 50, lastSignal: "SELL HDFCBANK @ 1702", lastSignalTime: "12 min ago" },
  { name: "Intraday Scalper", status: "PAUSED", positions: 0, pnl: -15200, pnlPct: -3.80, capital: 400000, trades: 34, winRate: 55, lastSignal: "PAUSED - drawdown breach", lastSignalTime: "30 min ago" },
  { name: "Mean Reversion Pro", status: "SHADOW", positions: 3, pnl: 18200, pnlPct: 6.07, capital: 300000, trades: 8, winRate: 63, lastSignal: "BUY INFY @ 1534", lastSignalTime: "2 min ago" },
];

const liveVsExpected = [
  { strategy: "Mom Alpha", live: 8.47, expected: 7.2 },
  { strategy: "Pair Trader", live: -4.23, expected: -2.1 },
  { strategy: "Scalper", live: -3.80, expected: 1.5 },
  { strategy: "Mean Rev", live: 6.07, expected: 5.8 },
];

const orderFlow = [
  { time: "14:32:15", strategy: "Momentum Alpha v3", symbol: "RELIANCE", action: "BUY", qty: 25, price: 2538.50, status: "FILLED" },
  { time: "14:28:00", strategy: "Pair Trader NIFTY", symbol: "HDFCBANK", action: "SELL", qty: 15, price: 1702.40, status: "FILLED" },
  { time: "14:22:30", strategy: "Mean Reversion Pro", symbol: "INFY", action: "BUY", qty: 50, price: 1534.20, status: "FILLED" },
  { time: "14:15:45", strategy: "Momentum Alpha v3", symbol: "ICICIBANK", action: "BUY", qty: 40, price: 1062.30, status: "FILLED" },
  { time: "14:10:00", strategy: "Pair Trader NIFTY", symbol: "BANKNIFTY PE", action: "SELL", qty: 10, price: 195.40, status: "FILLED" },
  { time: "14:02:20", strategy: "Mean Reversion Pro", symbol: "TCS", action: "BUY", qty: 15, price: 3845.20, status: "PARTIAL" },
  { time: "13:55:00", strategy: "Intraday Scalper", symbol: "SBIN", action: "SELL", qty: 100, price: 752.80, status: "REJECTED" },
  { time: "13:48:15", strategy: "Momentum Alpha v3", symbol: "RELIANCE", action: "BUY", qty: 25, price: 2512.10, status: "FILLED" },
];

const divergenceAlerts = [
  { strategy: "Intraday Scalper", score: 4.2, severity: "CRITICAL", message: "Live P&L -3.8% vs Expected +1.5%. Possible signal drift or execution quality issue." },
  { strategy: "Pair Trader NIFTY", score: 2.1, severity: "HIGH", message: "Live P&L -4.2% vs Expected -2.1%. Higher than expected slippage on HDFCBANK shorts." },
  { strategy: "Mean Reversion Pro", score: 0.3, severity: "LOW", message: "Minor divergence within acceptable range. Monitoring." },
];

const statusColor: Record<string, string> = {
  ACTIVE: "bg-emerald-500/20 text-emerald-400",
  PAUSED: "bg-amber-500/20 text-amber-400",
  SHADOW: "bg-purple-500/20 text-purple-400",
};

const orderStatusColor: Record<string, string> = {
  FILLED: "text-emerald-400",
  PARTIAL: "text-amber-400",
  REJECTED: "text-red-400",
};

const sevColor: Record<string, string> = {
  LOW: "bg-blue-500/20 text-blue-400",
  HIGH: "bg-orange-500/20 text-orange-400",
  CRITICAL: "bg-red-500/20 text-red-400",
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value > 0 ? "+" : ""}{entry.value}%
        </p>
      ))}
    </div>
  );
};

export default function LiveOpsPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-blue-400" />
            Live Operations
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time monitoring of live trading strategies</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Market hours &mdash; live data streaming
        </div>
      </div>

      {/* Position Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold">{positionSummary.totalPositions}</p>
          <p className="text-xs text-zinc-500 mt-1">Total Positions</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-400">{positionSummary.longPositions}</p>
          <p className="text-xs text-zinc-500 mt-1">Long Positions</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold text-red-400">{positionSummary.shortPositions}</p>
          <p className="text-xs text-zinc-500 mt-1">Short Positions</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold font-mono">{(positionSummary.totalExposure / 100000).toFixed(1)}L</p>
          <p className="text-xs text-zinc-500 mt-1">Total Exposure</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className={`text-2xl font-bold font-mono ${positionSummary.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            +{positionSummary.netPnl.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Net P&amp;L Today</p>
        </div>
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-400">{liveStrategies.filter(s => s.status === "ACTIVE").length}</p>
          <p className="text-xs text-zinc-500 mt-1">Active Strategies</p>
        </div>
      </div>

      {/* Active Strategies */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Live Strategies</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Strategy</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-right py-3 px-3 font-medium">Positions</th>
                <th className="text-right py-3 px-3 font-medium">Capital</th>
                <th className="text-right py-3 px-3 font-medium">P&amp;L</th>
                <th className="text-right py-3 px-3 font-medium">P&amp;L%</th>
                <th className="text-right py-3 px-3 font-medium">Trades</th>
                <th className="text-right py-3 px-3 font-medium">Win Rate</th>
                <th className="text-left py-3 px-5 font-medium">Last Signal</th>
              </tr>
            </thead>
            <tbody>
              {liveStrategies.map((s) => (
                <tr key={s.name} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                  <td className="py-3 px-5 font-medium">{s.name}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[s.status]}`}>
                      {s.status === "ACTIVE" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />}
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{s.positions}</td>
                  <td className="py-3 px-3 text-right font-mono text-zinc-400">{(s.capital / 100000).toFixed(0)}L</td>
                  <td className={`py-3 px-3 text-right font-mono ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.pnl >= 0 ? "+" : ""}{s.pnl.toLocaleString()}
                  </td>
                  <td className={`py-3 px-3 text-right font-mono ${s.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.pnlPct >= 0 ? "+" : ""}{s.pnlPct}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-zinc-400">{s.trades}</td>
                  <td className="py-3 px-3 text-right font-mono">{s.winRate}%</td>
                  <td className="py-3 px-5">
                    <div className="text-xs text-zinc-400 truncate max-w-[200px]">{s.lastSignal}</div>
                    <div className="text-[10px] text-zinc-500">{s.lastSignalTime}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live vs Expected Chart */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">Live vs Expected P&amp;L%</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={liveVsExpected} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="strategy" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#1e1e2e" }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2e" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="live" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Live">
                {liveVsExpected.map((entry, i) => (
                  <Cell key={i} fill={entry.live >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
              <Bar dataKey="expected" fill="#52525b" radius={[4, 4, 0, 0]} name="Expected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Divergence Alerts */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Divergence Alerts</h2>
            <AlertTriangle className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="space-y-3">
            {divergenceAlerts.map((alert, i) => (
              <div key={i} className="border border-[#1e1e2e] rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">{alert.strategy}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${sevColor[alert.severity]}`}>{alert.severity}</span>
                    <span className="text-xs font-mono text-amber-400">Score: {alert.score}</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Order Flow */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Order Flow Timeline</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
              <th className="text-left py-3 px-5 font-medium">Time</th>
              <th className="text-left py-3 px-3 font-medium">Strategy</th>
              <th className="text-left py-3 px-3 font-medium">Symbol</th>
              <th className="text-center py-3 px-3 font-medium">Action</th>
              <th className="text-right py-3 px-3 font-medium">Qty</th>
              <th className="text-right py-3 px-3 font-medium">Price</th>
              <th className="text-center py-3 px-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {orderFlow.map((o, i) => (
              <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                <td className="py-3 px-5 text-xs font-mono text-zinc-500">{o.time}</td>
                <td className="py-3 px-3 text-xs text-zinc-400">{o.strategy}</td>
                <td className="py-3 px-3 font-mono font-medium">{o.symbol}</td>
                <td className="py-3 px-3 text-center">
                  <span className={`text-xs font-medium ${o.action === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.action}</span>
                </td>
                <td className="py-3 px-3 text-right font-mono">{o.qty}</td>
                <td className="py-3 px-3 text-right font-mono text-zinc-400">{o.price.toFixed(2)}</td>
                <td className={`py-3 px-5 text-center text-xs font-medium ${orderStatusColor[o.status]}`}>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
