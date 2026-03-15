"use client";

import { useState, useEffect } from "react";
import {
  Landmark,
  Wifi,
  WifiOff,
  Clock,
  Shield,
  ShieldOff,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Timer,
  Key,
  LogIn,
  Power,
} from "lucide-react";

// ── Mock Data ──────────────────────────────────────────────

const session = {
  connected: true,
  token: "kite_••••••••••••a7x9",
  loginTime: "2026-03-15T06:15:00Z",
  expiresAt: "2026-03-16T03:30:00Z",
  userId: "ZR4821",
  broker: "Zerodha Kite",
};

const positions = [
  { symbol: "RELIANCE", exchange: "NSE", qty: 150, avgPrice: 2485.3, ltp: 2542.1, pnl: 8520, pnlPct: 2.29 },
  { symbol: "TCS", exchange: "NSE", qty: -75, avgPrice: 3920.5, ltp: 3875.2, pnl: 3397.5, pnlPct: 1.16 },
  { symbol: "HDFCBANK", exchange: "NSE", qty: 200, avgPrice: 1655.8, ltp: 1702.4, pnl: 9320, pnlPct: 2.81 },
  { symbol: "INFY", exchange: "NSE", qty: -100, avgPrice: 1485.0, ltp: 1512.3, pnl: -2730, pnlPct: -1.84 },
  { symbol: "NIFTY26MAR25000CE", exchange: "NFO", qty: 50, avgPrice: 245.5, ltp: 312.8, pnl: 3365, pnlPct: 27.41 },
  { symbol: "BANKNIFTY26MAR52000PE", exchange: "NFO", qty: -25, avgPrice: 180.0, ltp: 145.2, pnl: 870, pnlPct: 19.33 },
  { symbol: "TATAMOTORS", exchange: "NSE", qty: 300, avgPrice: 685.4, ltp: 672.1, pnl: -3990, pnlPct: -1.94 },
  { symbol: "ICICIBANK", exchange: "NSE", qty: 125, avgPrice: 1142.6, ltp: 1178.3, pnl: 4462.5, pnlPct: 3.12 },
];

const orders = [
  { id: "ORD-240315-001", symbol: "RELIANCE", type: "BUY", qty: 50, price: 2538.5, status: "COMPLETE", time: "09:15:32" },
  { id: "ORD-240315-002", symbol: "TCS", type: "SELL", qty: 25, price: 3878.0, status: "COMPLETE", time: "09:16:01" },
  { id: "ORD-240315-003", symbol: "HDFCBANK", type: "BUY", qty: 100, price: 1698.2, status: "COMPLETE", time: "09:20:15" },
  { id: "ORD-240315-004", symbol: "INFY", type: "SELL", qty: 50, price: 1510.0, status: "REJECTED", time: "09:22:44" },
  { id: "ORD-240315-005", symbol: "NIFTY26MAR25000CE", type: "BUY", qty: 50, price: 305.0, status: "COMPLETE", time: "09:30:00" },
  { id: "ORD-240315-006", symbol: "TATAMOTORS", type: "BUY", qty: 100, price: 674.5, status: "OPEN", time: "10:05:18" },
  { id: "ORD-240315-007", symbol: "BANKNIFTY26MAR52000PE", type: "SELL", qty: 10, price: 148.0, status: "COMPLETE", time: "10:12:33" },
  { id: "ORD-240315-008", symbol: "ICICIBANK", type: "BUY", qty: 75, price: 1175.0, status: "COMPLETE", time: "10:30:45" },
  { id: "ORD-240315-009", symbol: "RELIANCE", type: "SELL", qty: 25, price: 2545.0, status: "PENDING", time: "11:00:02" },
  { id: "ORD-240315-010", symbol: "HDFCBANK", type: "BUY", qty: 50, price: 1700.0, status: "CANCELLED", time: "11:15:20" },
  { id: "ORD-240315-011", symbol: "TCS", type: "SELL", qty: 50, price: 3880.0, status: "COMPLETE", time: "11:45:08" },
  { id: "ORD-240315-012", symbol: "TATAMOTORS", type: "SELL", qty: 50, price: 680.0, status: "TRIGGER_PENDING", time: "12:00:00" },
];

const orderStatusColor: Record<string, string> = {
  COMPLETE: "bg-emerald-500/20 text-emerald-400",
  OPEN: "bg-blue-500/20 text-blue-400",
  PENDING: "bg-amber-500/20 text-amber-400",
  REJECTED: "bg-red-500/20 text-red-400",
  CANCELLED: "bg-zinc-500/20 text-zinc-400",
  TRIGGER_PENDING: "bg-purple-500/20 text-purple-400",
};

function formatCountdown(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function BrokeragePage() {
  const [countdown, setCountdown] = useState(formatCountdown(session.expiresAt));
  const [killSwitchArmed, setKillSwitchArmed] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(session.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.qty * p.ltp), 0);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Landmark className="h-7 w-7 text-blue-500" />
            Brokerage
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Zerodha Kite Connect integration and order management</p>
        </div>
      </div>

      {/* Connection Status Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-gradient-to-br from-[#111118] via-[#111118] to-emerald-500/5 p-6">
        <div className="absolute top-4 right-4">
          {session.connected && (
            <span className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500" />
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Status */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${session.connected ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              {session.connected ? (
                <Wifi className="h-7 w-7 text-emerald-400" />
              ) : (
                <WifiOff className="h-7 w-7 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Status</p>
              <p className={`text-lg font-bold ${session.connected ? "text-emerald-400" : "text-red-400"}`}>
                {session.connected ? "Connected" : "Disconnected"}
              </p>
              <p className="text-xs text-zinc-500">{session.broker} / {session.userId}</p>
            </div>
          </div>

          {/* Token */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Key className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Access Token</p>
              <p className="text-sm font-mono text-zinc-300">{session.token}</p>
              <p className="text-xs text-zinc-500">Login: {new Date(session.loginTime).toLocaleTimeString()}</p>
            </div>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Timer className="h-7 w-7 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Session Expires</p>
              <p className="text-lg font-bold font-mono text-amber-400">{countdown}</p>
              <p className="text-xs text-zinc-500">At {new Date(session.expiresAt).toLocaleTimeString()}</p>
            </div>
          </div>

          {/* Connect Button */}
          <div className="flex items-center">
            <a
              href="/api/brokers/zerodha/login-url"
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
            >
              <LogIn className="h-4 w-4" />
              {session.connected ? "Reconnect Zerodha" : "Connect Zerodha"}
            </a>
          </div>
        </div>

        {/* Summary bar */}
        <div className="mt-6 pt-4 border-t border-[#1e1e2e] grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500">Total Exposure</p>
            <p className="text-lg font-bold font-mono">{(totalExposure / 100000).toFixed(2)}L</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Day P&L</p>
            <p className={`text-lg font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Open Positions</p>
            <p className="text-lg font-bold font-mono">{positions.length}</p>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Open Positions</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{positions.length} active positions across exchanges</p>
          </div>
          <span className={`text-sm font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            Net: {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Symbol</th>
                <th className="text-left py-3 px-3 font-medium">Exchange</th>
                <th className="text-right py-3 px-3 font-medium">Qty</th>
                <th className="text-right py-3 px-3 font-medium">Avg Price</th>
                <th className="text-right py-3 px-3 font-medium">LTP</th>
                <th className="text-right py-3 px-3 font-medium">P&L</th>
                <th className="text-right py-3 px-5 font-medium">P&L %</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                  <td className="py-3 px-5 font-medium font-mono">{p.symbol}</td>
                  <td className="py-3 px-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-[#1e1e2e] text-zinc-400">{p.exchange}</span>
                  </td>
                  <td className={`py-3 px-3 text-right font-mono ${p.qty > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {p.qty > 0 ? "+" : ""}{p.qty}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-zinc-300">{p.avgPrice.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-mono text-white">{p.ltp.toFixed(2)}</td>
                  <td className={`py-3 px-3 text-right font-mono font-medium ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {p.pnl >= 0 ? "+" : ""}{p.pnl.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <span className={`inline-flex items-center gap-1 font-mono text-sm ${p.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.pnlPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(p.pnlPct).toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Today&apos;s Orders</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{orders.length} orders placed today</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            {orders.filter((o) => o.status === "COMPLETE").length} filled
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Order ID</th>
                <th className="text-left py-3 px-3 font-medium">Symbol</th>
                <th className="text-center py-3 px-3 font-medium">Type</th>
                <th className="text-right py-3 px-3 font-medium">Qty</th>
                <th className="text-right py-3 px-3 font-medium">Price</th>
                <th className="text-center py-3 px-3 font-medium">Status</th>
                <th className="text-right py-3 px-5 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                  <td className="py-3 px-5 font-mono text-xs text-zinc-400">{o.id}</td>
                  <td className="py-3 px-3 font-medium font-mono">{o.symbol}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${o.type === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {o.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{o.qty}</td>
                  <td className="py-3 px-3 text-right font-mono text-zinc-300">{o.price.toFixed(2)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${orderStatusColor[o.status] || "bg-zinc-500/20 text-zinc-400"}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right font-mono text-xs text-zinc-400">{o.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kill Switch */}
      <div className={`rounded-2xl border-2 p-6 transition-all ${killSwitchActive ? "border-red-500 bg-red-500/5" : "border-red-500/20 bg-[#111118]"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${killSwitchActive ? "bg-red-500/20" : "bg-red-500/10"}`}>
              {killSwitchActive ? (
                <ShieldOff className="h-7 w-7 text-red-400" />
              ) : (
                <Shield className="h-7 w-7 text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Emergency Kill Switch
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                {killSwitchActive
                  ? "ACTIVE - All trading halted. All open orders cancelled."
                  : "Square off all positions and cancel all pending orders immediately"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!killSwitchActive && !killSwitchArmed && (
              <button
                onClick={() => setKillSwitchArmed(true)}
                className="flex items-center gap-2 rounded-xl border-2 border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Power className="h-4 w-4" />
                Arm Kill Switch
              </button>
            )}
            {killSwitchArmed && !killSwitchActive && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setKillSwitchArmed(false)}
                  className="rounded-xl border border-[#1e1e2e] px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setKillSwitchActive(true);
                    setKillSwitchArmed(false);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 animate-pulse"
                >
                  <AlertTriangle className="h-4 w-4" />
                  CONFIRM KILL SWITCH
                </button>
              </div>
            )}
            {killSwitchActive && (
              <button
                onClick={() => setKillSwitchActive(false)}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Deactivate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
