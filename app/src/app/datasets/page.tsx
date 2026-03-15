"use client";

import { useState } from "react";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Globe,
  BarChart3,
  Hash,
  Filter,
  ArrowUpDown,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  type: "EQ" | "FUT" | "CE" | "PE";
  lotSize: number;
  tickSize: number;
  segment: string;
  lastPrice: number;
  dayChange: number;
}

// ── Mock Data ──────────────────────────────────────────────

const stats = {
  totalInstruments: 4287,
  lastSync: "2026-03-15T06:00:00Z",
  exchanges: ["NSE", "NFO", "BSE", "CDS", "MCX"],
  uniqueSymbols: 1842,
  dataQuality: 99.7,
  staleInstruments: 12,
};

const instruments: Instrument[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2542.10, dayChange: 1.24 },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 3875.20, dayChange: -0.38 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1702.40, dayChange: 0.85 },
  { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1512.30, dayChange: -0.62 },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1178.30, dayChange: 1.05 },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2380.50, dayChange: 0.42 },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 577.00, dayChange: 1.87 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1620.40, dayChange: -0.15 },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1845.60, dayChange: 0.73 },
  { symbol: "ITC", name: "ITC Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 428.90, dayChange: 0.28 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 7130.00, dayChange: -1.12 },
  { symbol: "LT", name: "Larsen & Toubro Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 3520.80, dayChange: 0.95 },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1082.40, dayChange: 1.32 },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2820.30, dayChange: -0.45 },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 12450.00, dayChange: 0.68 },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 672.10, dayChange: -1.94 },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1425.60, dayChange: 0.52 },
  { symbol: "WIPRO", name: "Wipro Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 445.20, dayChange: -0.72 },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 11250.00, dayChange: 0.34 },
  { symbol: "TITAN", name: "Titan Company Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 3280.50, dayChange: 1.15 },
  { symbol: "NESTLEIND", name: "Nestle India Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2480.00, dayChange: 0.18 },
  { symbol: "TECHM", name: "Tech Mahindra Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1520.30, dayChange: -0.55 },
  { symbol: "HCLTECH", name: "HCL Technologies Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1680.40, dayChange: 0.82 },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 312.60, dayChange: 0.45 },
  { symbol: "NTPC", name: "NTPC Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 358.20, dayChange: 1.62 },
  { symbol: "NIFTY26MAR25000CE", name: "NIFTY 25000 CE 26-Mar", exchange: "NFO", type: "CE", lotSize: 50, tickSize: 0.05, segment: "NFO-OPT", lastPrice: 312.80, dayChange: 15.42 },
  { symbol: "NIFTY26MAR25000PE", name: "NIFTY 25000 PE 26-Mar", exchange: "NFO", type: "PE", lotSize: 50, tickSize: 0.05, segment: "NFO-OPT", lastPrice: 185.40, dayChange: -8.23 },
  { symbol: "NIFTY26MAR24500CE", name: "NIFTY 24500 CE 26-Mar", exchange: "NFO", type: "CE", lotSize: 50, tickSize: 0.05, segment: "NFO-OPT", lastPrice: 620.50, dayChange: 12.15 },
  { symbol: "BANKNIFTY26MAR52000CE", name: "BANKNIFTY 52000 CE 26-Mar", exchange: "NFO", type: "CE", lotSize: 25, tickSize: 0.05, segment: "NFO-OPT", lastPrice: 445.20, dayChange: 18.30 },
  { symbol: "BANKNIFTY26MAR52000PE", name: "BANKNIFTY 52000 PE 26-Mar", exchange: "NFO", type: "PE", lotSize: 25, tickSize: 0.05, segment: "NFO-OPT", lastPrice: 145.20, dayChange: -22.10 },
  { symbol: "RELIANCE26MARFUT", name: "RELIANCE FUT 26-Mar", exchange: "NFO", type: "FUT", lotSize: 250, tickSize: 0.05, segment: "NFO-FUT", lastPrice: 2545.80, dayChange: 1.28 },
  { symbol: "TCS26MARFUT", name: "TCS FUT 26-Mar", exchange: "NFO", type: "FUT", lotSize: 150, tickSize: 0.05, segment: "NFO-FUT", lastPrice: 3878.00, dayChange: -0.35 },
  { symbol: "HDFCBANK26MARFUT", name: "HDFCBANK FUT 26-Mar", exchange: "NFO", type: "FUT", lotSize: 550, tickSize: 0.05, segment: "NFO-FUT", lastPrice: 1704.20, dayChange: 0.88 },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 9120.50, dayChange: 0.72 },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 6450.30, dayChange: -0.28 },
  { symbol: "CIPLA", name: "Cipla Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1520.80, dayChange: 0.92 },
  { symbol: "EICHERMOT", name: "Eicher Motors Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 4820.00, dayChange: 1.45 },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2380.60, dayChange: -2.15 },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 148.30, dayChange: 1.78 },
  { symbol: "M&M", name: "Mahindra & Mahindra Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2950.40, dayChange: 0.55 },
  { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 1420.80, dayChange: -0.82 },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 885.20, dayChange: 2.12 },
  { symbol: "ONGC", name: "Oil & Natural Gas Corporation Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 278.40, dayChange: 0.95 },
  { symbol: "BPCL", name: "Bharat Petroleum Corporation Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 342.60, dayChange: 1.38 },
  { symbol: "GRASIM", name: "Grasim Industries Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 2480.00, dayChange: 0.42 },
  { symbol: "COALINDIA", name: "Coal India Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 458.30, dayChange: 1.15 },
  { symbol: "DIVISLAB", name: "Divi's Laboratories Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 5820.50, dayChange: -0.62 },
  { symbol: "BRITANNIA", name: "Britannia Industries Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 5450.00, dayChange: 0.28 },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 4620.80, dayChange: 0.85 },
  { symbol: "HINDALCO", name: "Hindalco Industries Ltd", exchange: "NSE", type: "EQ", lotSize: 1, tickSize: 0.05, segment: "NSE", lastPrice: 642.30, dayChange: 2.45 },
];

// ── Helpers ──────────────────────────────────────────────

const typeColors: Record<string, string> = {
  EQ: "bg-blue-500/20 text-blue-400",
  FUT: "bg-purple-500/20 text-purple-400",
  CE: "bg-emerald-500/20 text-emerald-400",
  PE: "bg-red-500/20 text-red-400",
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Component ──────────────────────────────────────────────

export default function DatasetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterExchange, setFilterExchange] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"symbol" | "dayChange">("symbol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = instruments
    .filter((i) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          i.symbol.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .filter((i) => filterExchange === "all" || i.exchange === filterExchange)
    .filter((i) => filterType === "all" || i.type === filterType)
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      return (a.dayChange - b.dayChange) * dir;
    });

  function toggleSort(col: "symbol" | "dayChange") {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Database className="h-7 w-7 text-blue-500" />
            Datasets
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Symbol master, instrument browser, and data quality
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20">
          <RefreshCw className="h-4 w-4" />
          Sync Now
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Instruments", value: stats.totalInstruments.toLocaleString(), icon: Hash, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Unique Symbols", value: stats.uniqueSymbols.toLocaleString(), icon: BarChart3, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "Exchanges", value: stats.exchanges.length.toString(), icon: Globe, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Data Quality", value: `${stats.dataQuality}%`, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Last Sync", value: formatTimestamp(stats.lastSync).split(",")[0], icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Data Quality Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-400">Data Quality: {stats.dataQuality}%</p>
            <p className="text-xs text-zinc-500">{stats.totalInstruments - stats.staleInstruments} instruments up-to-date</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">{stats.staleInstruments} Stale Records</p>
            <p className="text-xs text-zinc-500">May have outdated lot sizes or tick sizes</p>
          </div>
        </div>
        <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4 flex items-center gap-3">
          <Globe className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Exchanges Covered</p>
            <div className="flex items-center gap-1.5 mt-1">
              {stats.exchanges.map((ex) => (
                <span key={ex} className="text-[10px] px-2 py-0.5 rounded bg-[#1e1e2e] text-zinc-400 font-mono">
                  {ex}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Universe Browser */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#1e1e2e]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Instrument Browser</h2>
              <p className="text-xs text-zinc-500 mt-0.5">{filtered.length} instruments</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbols or names..."
                className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <select
              value={filterExchange}
              onChange={(e) => setFilterExchange(e.target.value)}
              className="rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3 py-2 text-sm text-zinc-300 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Exchanges</option>
              {stats.exchanges.map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3 py-2 text-sm text-zinc-300 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="EQ">Equity</option>
              <option value="FUT">Futures</option>
              <option value="CE">Call Options</option>
              <option value="PE">Put Options</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3 px-5 font-medium">
                  <button onClick={() => toggleSort("symbol")} className="flex items-center gap-1 hover:text-zinc-300 transition-colors">
                    Symbol
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left py-3 px-3 font-medium">Name</th>
                <th className="text-center py-3 px-3 font-medium">Exchange</th>
                <th className="text-center py-3 px-3 font-medium">Type</th>
                <th className="text-right py-3 px-3 font-medium">Lot Size</th>
                <th className="text-right py-3 px-3 font-medium">Last Price</th>
                <th className="text-right py-3 px-5 font-medium">
                  <button onClick={() => toggleSort("dayChange")} className="flex items-center gap-1 hover:text-zinc-300 transition-colors ml-auto">
                    Day Change
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inst) => (
                <tr key={inst.symbol} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                  <td className="py-2.5 px-5 font-mono font-medium text-white">{inst.symbol}</td>
                  <td className="py-2.5 px-3 text-xs text-zinc-400 max-w-xs truncate">{inst.name}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e1e2e] text-zinc-400 font-mono">{inst.exchange}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${typeColors[inst.type]}`}>{inst.type}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{inst.lotSize}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{inst.lastPrice.toFixed(2)}</td>
                  <td className="py-2.5 px-5 text-right">
                    <span className={`font-mono text-xs ${inst.dayChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {inst.dayChange >= 0 ? "+" : ""}{inst.dayChange.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <Search className="h-10 w-10 mb-3" />
            <p className="text-sm">No instruments found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
