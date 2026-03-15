"use client";

import {
  Database, RefreshCw, CheckCircle, Clock, AlertTriangle,
  Download, Search, Activity, Globe, BarChart3,
  TrendingUp, Layers
} from "lucide-react";

const symbolMasterStats = {
  totalInstruments: 78432,
  nseEquity: 2089,
  nfoDerivatives: 45230,
  bseEquity: 28413,
  cds: 2700,
  lastSyncTime: "2026-03-15 09:15:00",
  nextSyncTime: "2026-03-16 06:00:00",
  syncStatus: "COMPLETE",
};

const exchanges = [
  { name: "NSE", instruments: 2089, status: "SYNCED", lastSync: "09:15:00", quality: 99.8 },
  { name: "NFO", instruments: 45230, status: "SYNCED", lastSync: "09:15:00", quality: 99.5 },
  { name: "BSE", instruments: 28413, status: "SYNCED", lastSync: "09:15:00", quality: 98.2 },
  { name: "CDS", instruments: 2700, status: "SYNCED", lastSync: "09:15:00", quality: 99.9 },
];

const universes = [
  { name: "NIFTY 50", count: 50, active: true, lastUpdate: "Today 09:15" },
  { name: "NIFTY 100", count: 100, active: true, lastUpdate: "Today 09:15" },
  { name: "NIFTY 500", count: 500, active: false, lastUpdate: "Today 09:15" },
  { name: "NIFTY BANK", count: 12, active: true, lastUpdate: "Today 09:15" },
  { name: "NIFTY FIN SERVICE", count: 20, active: false, lastUpdate: "Today 09:15" },
  { name: "NIFTY IT", count: 10, active: false, lastUpdate: "Today 09:15" },
  { name: "NIFTY MIDCAP 150", count: 150, active: false, lastUpdate: "Today 09:15" },
  { name: "NIFTY SMALLCAP 250", count: 250, active: false, lastUpdate: "Today 09:15" },
  { name: "F&O Lot Sizes", count: 185, active: true, lastUpdate: "Today 09:15" },
  { name: "Custom Watchlist", count: 25, active: true, lastUpdate: "Yesterday 15:30" },
];

const qualityIndicators = [
  { metric: "Price Data Completeness", value: 99.7, unit: "%", status: "good" },
  { metric: "Volume Data Completeness", value: 98.9, unit: "%", status: "good" },
  { metric: "Corporate Actions Updated", value: 100, unit: "%", status: "good" },
  { metric: "Options Chain Coverage", value: 97.2, unit: "%", status: "warning" },
  { metric: "Historical Data Depth", value: 6, unit: "years", status: "good" },
  { metric: "Tick Data Latency", value: 45, unit: "ms", status: "good" },
  { metric: "Missing Bar Ratio", value: 0.3, unit: "%", status: "good" },
  { metric: "Stale Price Count", value: 12, unit: "symbols", status: "warning" },
];

const qualityColor: Record<string, string> = {
  good: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

export default function DatasetsPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-400" />
            Datasets
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Data management, symbol master, and quality monitoring</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Trigger Sync
        </button>
      </div>

      {/* Symbol Master Stats */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Symbol Master</h2>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Last sync: {symbolMasterStats.lastSyncTime}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xl font-bold font-mono">{symbolMasterStats.totalInstruments.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">Total Instruments</p>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xl font-bold font-mono text-blue-400">{symbolMasterStats.nseEquity.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">NSE Equity</p>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xl font-bold font-mono text-purple-400">{symbolMasterStats.nfoDerivatives.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">NFO Derivatives</p>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xl font-bold font-mono text-amber-400">{symbolMasterStats.bseEquity.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">BSE Equity</p>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xl font-bold font-mono text-cyan-400">{symbolMasterStats.cds.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">CDS</p>
          </div>
          <div className="bg-[#0a0a0f] rounded-lg p-3">
            <p className="text-xs font-mono text-zinc-300">Next sync</p>
            <p className="text-xs text-zinc-500 mt-1">{symbolMasterStats.nextSyncTime}</p>
          </div>
        </div>
      </div>

      {/* Exchange Status Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <h2 className="text-sm font-semibold">Exchange Status</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
              <th className="text-left py-3 px-5 font-medium">Exchange</th>
              <th className="text-right py-3 px-3 font-medium">Instruments</th>
              <th className="text-center py-3 px-3 font-medium">Status</th>
              <th className="text-right py-3 px-3 font-medium">Last Sync</th>
              <th className="text-right py-3 px-5 font-medium">Data Quality</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((ex) => (
              <tr key={ex.name} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                <td className="py-3 px-5 font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4 text-zinc-500" />
                  {ex.name}
                </td>
                <td className="py-3 px-3 text-right font-mono text-zinc-400">{ex.instruments.toLocaleString()}</td>
                <td className="py-3 px-3 text-center">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-400">
                    {ex.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-xs text-zinc-500">{ex.lastSync}</td>
                <td className="py-3 px-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 bg-[#1e1e2e] rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${ex.quality >= 99 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${ex.quality}%` }} />
                    </div>
                    <span className={`text-xs font-mono ${ex.quality >= 99 ? "text-emerald-400" : "text-amber-400"}`}>{ex.quality}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Universe Selector */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-400" /> Universes
            </h2>
            <span className="text-xs text-zinc-500">{universes.filter(u => u.active).length} active</span>
          </div>
          <div className="space-y-2">
            {universes.map((u) => (
              <div key={u.name} className="flex items-center justify-between p-3 border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${u.active ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <div>
                    <p className="text-xs font-medium">{u.name}</p>
                    <p className="text-[10px] text-zinc-500">{u.count} instruments &middot; {u.lastUpdate}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  u.active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"
                }`}>{u.active ? "Active" : "Inactive"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data Quality */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-zinc-400" /> Data Quality Indicators
            </h2>
          </div>
          <div className="space-y-3">
            {qualityIndicators.map((q) => (
              <div key={q.metric} className="flex items-center justify-between p-3 border border-[#1e1e2e] rounded-lg">
                <div className="flex items-center gap-2">
                  {q.status === "good" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : q.status === "warning" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs">{q.metric}</span>
                </div>
                <span className={`text-sm font-mono font-bold ${qualityColor[q.status]}`}>
                  {q.value}{q.unit === "%" ? "%" : q.unit === "ms" ? " ms" : q.unit === "years" ? " yrs" : q.unit === "symbols" ? "" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
