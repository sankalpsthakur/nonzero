"use client";

import { useState } from "react";
import {
  ShieldAlert,
  Power,
  AlertTriangle,
  ShieldOff,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  Gauge,
  Percent,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Ban,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface RiskPolicy {
  id: string;
  name: string;
  type: "POSITION" | "PORTFOLIO" | "LOSS" | "EXECUTION" | "CONCENTRATION";
  threshold: string;
  currentValue: string;
  utilization: number;
  enabled: boolean;
  breachCount: number;
  lastBreachedAt?: string;
}

interface PositionRow {
  symbol: string;
  exchange: string;
  qty: number;
  exposure: number;
  exposurePct: number;
  weight: number;
  pnl: number;
  pnlPct: number;
}

// ── Mock Data ──────────────────────────────────────────────

const riskPolicies: RiskPolicy[] = [
  { id: "RP-001", name: "Max Position Size", type: "POSITION", threshold: "10,00,000", currentValue: "7,85,420", utilization: 78.5, enabled: true, breachCount: 2, lastBreachedAt: "2026-03-13T14:20:00Z" },
  { id: "RP-002", name: "Daily Loss Limit", type: "LOSS", threshold: "50,000", currentValue: "12,340", utilization: 24.7, enabled: true, breachCount: 1, lastBreachedAt: "2026-03-15T09:45:00Z" },
  { id: "RP-003", name: "Max Drawdown Breaker", type: "LOSS", threshold: "2,00,000", currentValue: "48,200", utilization: 24.1, enabled: true, breachCount: 0 },
  { id: "RP-004", name: "Position Concentration", type: "CONCENTRATION", threshold: "40%", currentValue: "32.1%", utilization: 80.3, enabled: true, breachCount: 3, lastBreachedAt: "2026-03-13T14:20:00Z" },
  { id: "RP-005", name: "Max Open Orders", type: "EXECUTION", threshold: "25", currentValue: "8", utilization: 32.0, enabled: true, breachCount: 0 },
  { id: "RP-006", name: "Max Total Exposure", type: "PORTFOLIO", threshold: "50,00,000", currentValue: "32,45,000", utilization: 64.9, enabled: true, breachCount: 0 },
  { id: "RP-007", name: "Overnight Position Limit", type: "POSITION", threshold: "20,00,000", currentValue: "15,00,000", utilization: 75.0, enabled: true, breachCount: 1, lastBreachedAt: "2026-03-08T15:30:00Z" },
  { id: "RP-008", name: "Options Notional Limit", type: "PORTFOLIO", threshold: "30,00,000", currentValue: "12,50,000", utilization: 41.7, enabled: false, breachCount: 0 },
];

const positions: PositionRow[] = [
  { symbol: "RELIANCE", exchange: "NSE", qty: 150, exposure: 381315, exposurePct: 11.75, weight: 15.2, pnl: 8520, pnlPct: 2.29 },
  { symbol: "HDFCBANK", exchange: "NSE", qty: 200, exposure: 340480, exposurePct: 10.49, weight: 13.6, pnl: 9320, pnlPct: 2.81 },
  { symbol: "ICICIBANK", exchange: "NSE", qty: 125, exposure: 147288, exposurePct: 4.54, weight: 5.9, pnl: 4463, pnlPct: 3.12 },
  { symbol: "TCS", exchange: "NSE", qty: -75, exposure: 290640, exposurePct: 8.95, weight: 11.6, pnl: 3398, pnlPct: 1.16 },
  { symbol: "INFY", exchange: "NSE", qty: -100, exposure: 151230, exposurePct: 4.66, weight: 6.0, pnl: -2730, pnlPct: -1.84 },
  { symbol: "TATAMOTORS", exchange: "NSE", qty: 300, exposure: 201630, exposurePct: 6.21, weight: 8.1, pnl: -3990, pnlPct: -1.94 },
  { symbol: "NIFTY 25000CE", exchange: "NFO", qty: 50, exposure: 782000, exposurePct: 24.10, weight: 31.2, pnl: 3365, pnlPct: 27.41 },
  { symbol: "BANKNIFTY 52000PE", exchange: "NFO", qty: -25, exposure: 181500, exposurePct: 5.59, weight: 7.2, pnl: 870, pnlPct: 19.33 },
  { symbol: "SBIN", exchange: "NSE", qty: 200, exposure: 115400, exposurePct: 3.56, weight: 4.6, pnl: 1820, pnlPct: 1.60 },
  { symbol: "BAJFINANCE", exchange: "NSE", qty: 30, exposure: 213900, exposurePct: 6.59, weight: 8.5, pnl: -1240, pnlPct: -0.58 },
];

// ── Gauge Component ──────────────────────────────────────────

function GaugeCard({
  title,
  value,
  limit,
  percentage,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  limit: string;
  percentage: number;
  icon: React.ElementType;
  color: "blue" | "emerald" | "amber" | "red";
}) {
  const colorMap = {
    blue: { bar: "bg-blue-500", text: "text-blue-400", bg: "bg-blue-500/10" },
    emerald: { bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
    amber: { bar: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" },
    red: { bar: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
  };

  const effectiveColor =
    percentage >= 90 ? "red" : percentage >= 70 ? "amber" : color;
  const c = colorMap[effectiveColor];

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{title}</p>
          <p className={`text-lg font-bold font-mono ${c.text}`}>{value}</p>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 rounded-full bg-[#1e1e2e] overflow-hidden mb-2">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${c.bar} transition-all duration-700`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {/* Threshold marker at 80% */}
        <div className="absolute inset-y-0 left-[80%] w-0.5 bg-zinc-600" />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{percentage.toFixed(1)}% utilized</span>
        <span>Limit: {limit}</span>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

const typeColors: Record<string, string> = {
  POSITION: "bg-blue-500/20 text-blue-400",
  PORTFOLIO: "bg-purple-500/20 text-purple-400",
  LOSS: "bg-red-500/20 text-red-400",
  EXECUTION: "bg-amber-500/20 text-amber-400",
  CONCENTRATION: "bg-orange-500/20 text-orange-400",
};

function heatColor(pct: number): string {
  if (pct >= 25) return "bg-red-500/30";
  if (pct >= 15) return "bg-orange-500/20";
  if (pct >= 8) return "bg-amber-500/15";
  return "bg-[#111118]";
}

// ── Component ──────────────────────────────────────────────

export default function RiskPage() {
  const [killSwitchArmed, setKillSwitchArmed] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [policies, setPolicies] = useState(riskPolicies);

  const totalExposure = positions.reduce((s, p) => s + p.exposure, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

  function togglePolicy(id: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-red-500" />
            Risk Controls
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Risk policies, position limits, and circuit breakers
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Risk engine active
        </div>
      </div>

      {/* Kill Switch - Prominent Red Area */}
      <div
        className={`rounded-2xl border-2 p-6 transition-all ${
          killSwitchActive
            ? "border-red-500 bg-red-500/5 shadow-lg shadow-red-500/10"
            : "border-red-500/20 bg-gradient-to-br from-[#111118] to-red-500/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                killSwitchActive ? "bg-red-500/30" : "bg-red-500/10"
              }`}
            >
              {killSwitchActive ? (
                <ShieldOff className="h-7 w-7 text-red-400" />
              ) : (
                <Power className="h-7 w-7 text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Global Kill Switch
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                {killSwitchActive
                  ? "ACTIVE -- All trading halted. All open orders cancelled."
                  : "Emergency halt: cancels all orders, blocks new trades across all strategies"}
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
                <CheckCircle2 className="h-4 w-4" />
                Deactivate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gauge Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GaugeCard
          title="Capital Utilization"
          value="32.45L / 50.00L"
          limit="50,00,000"
          percentage={64.9}
          icon={DollarSign}
          color="blue"
        />
        <GaugeCard
          title="Daily P&L vs Limit"
          value={`${totalPnl >= 0 ? "+" : ""}${(totalPnl / 1000).toFixed(1)}K / -50K`}
          limit="-50,000"
          percentage={24.7}
          icon={TrendingDown}
          color="emerald"
        />
        <GaugeCard
          title="Position Concentration"
          value="31.2% (NIFTY CE)"
          limit="40%"
          percentage={78.0}
          icon={Percent}
          color="amber"
        />
      </div>

      {/* Risk Policy Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-300">Risk Policies</h2>
          <span className="text-xs text-zinc-500">
            {policies.filter((p) => p.enabled).length} active / {policies.length} total
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className={`rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 transition-all ${
                !policy.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">
                    {policy.name}
                  </h3>
                  <span
                    className={`inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded mt-1 ${typeColors[policy.type]}`}
                  >
                    {policy.type}
                  </span>
                </div>
                <button
                  onClick={() => togglePolicy(policy.id)}
                  className="shrink-0 ml-2"
                >
                  {policy.enabled ? (
                    <ToggleRight className="h-6 w-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-zinc-600" />
                  )}
                </button>
              </div>

              {/* Threshold & Current */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Threshold</span>
                  <span className="font-mono text-zinc-300">{policy.threshold}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Current</span>
                  <span className="font-mono text-white">{policy.currentValue}</span>
                </div>
              </div>

              {/* Utilization bar */}
              <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${
                    policy.utilization >= 90
                      ? "bg-red-500"
                      : policy.utilization >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(policy.utilization, 100)}%` }}
                />
              </div>

              {/* Breach info */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">{policy.utilization.toFixed(1)}% used</span>
                {policy.breachCount > 0 ? (
                  <span className="flex items-center gap-1 text-red-400">
                    <Ban className="h-3 w-3" />
                    {policy.breachCount} breach{policy.breachCount !== 1 && "es"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    No breaches
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Position Heat Map Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Position Heat Map</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Exposure concentration and P&L by instrument
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              Total Exposure:{" "}
              <span className="text-white font-mono font-bold">
                {(totalExposure / 100000).toFixed(2)}L
              </span>
            </span>
            <span>
              Net P&L:{" "}
              <span
                className={`font-mono font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {totalPnl >= 0 ? "+" : ""}
                {totalPnl.toLocaleString("en-IN")}
              </span>
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">Symbol</th>
                <th className="text-left py-3 px-3 font-medium">Exchange</th>
                <th className="text-right py-3 px-3 font-medium">Qty</th>
                <th className="text-right py-3 px-3 font-medium">Exposure</th>
                <th className="text-right py-3 px-3 font-medium">Exposure %</th>
                <th className="text-right py-3 px-3 font-medium">Weight %</th>
                <th className="text-right py-3 px-3 font-medium">P&L</th>
                <th className="text-right py-3 px-5 font-medium">P&L %</th>
              </tr>
            </thead>
            <tbody>
              {positions
                .sort((a, b) => b.weight - a.weight)
                .map((p) => (
                  <tr
                    key={p.symbol}
                    className={`border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors ${heatColor(p.weight)}`}
                  >
                    <td className="py-3 px-5 font-medium font-mono text-white">
                      {p.symbol}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-[#1e1e2e] text-zinc-400">
                        {p.exchange}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono ${p.qty > 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {p.qty > 0 ? "+" : ""}
                      {p.qty}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      {(p.exposure / 100000).toFixed(2)}L
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      {p.exposurePct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 rounded-full bg-[#1e1e2e] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.weight >= 30
                                ? "bg-red-500"
                                : p.weight >= 15
                                  ? "bg-amber-500"
                                  : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(p.weight * 2.5, 100)}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono text-xs ${
                            p.weight >= 30
                              ? "text-red-400"
                              : p.weight >= 15
                                ? "text-amber-400"
                                : "text-zinc-300"
                          }`}
                        >
                          {p.weight.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-medium ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {p.pnl >= 0 ? "+" : ""}
                      {p.pnl.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-xs ${p.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {p.pnlPct >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(p.pnlPct).toFixed(2)}%
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
