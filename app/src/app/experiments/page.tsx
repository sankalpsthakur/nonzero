"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Beaker, Search, Plus, ChevronLeft, ChevronRight, ChevronDown,
  ArrowUpDown, Calendar, X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data — 15 experiments
// ---------------------------------------------------------------------------

const experiments = [
  { id: "EXP-001", name: "Momentum Alpha v4", family: "Momentum", hypothesis: "RSI divergence combined with volume breakouts on NIFTY50 stocks yields higher alpha in trending markets with controlled drawdown.", runs: 24, bestReturn: 34.2, bestAlpha: 12.8, sharpe: 2.41, status: "RUNNING", created: "2026-03-12" },
  { id: "EXP-002", name: "Mean Reversion Intraday", family: "Mean Reversion", hypothesis: "Bollinger band reversion on liquid F&O stocks with adaptive bandwidth and volume-weighted entries.", runs: 18, bestReturn: 28.7, bestAlpha: 10.1, sharpe: 2.12, status: "COMPLETED", created: "2026-02-10" },
  { id: "EXP-003", name: "Breakout Hunter v3", family: "Breakout", hypothesis: "Multi-timeframe breakout confirmation using ATR expansion and OBV divergence signals.", runs: 31, bestReturn: 26.4, bestAlpha: 9.5, sharpe: 1.94, status: "COMPLETED", created: "2026-01-28" },
  { id: "EXP-004", name: "Vol Crush Strategy", family: "Volatility", hypothesis: "Short straddles with delta hedging on high IV rank environments targeting theta decay.", runs: 15, bestReturn: 19.8, bestAlpha: 6.9, sharpe: 1.67, status: "RUNNING", created: "2026-02-20" },
  { id: "EXP-005", name: "Pair NIFTY-BANKNIFTY", family: "Pairs Trading", hypothesis: "Mean reversion of NIFTY-BANKNIFTY spread with cointegration-based dynamic thresholds.", runs: 12, bestReturn: 22.1, bestAlpha: 7.3, sharpe: 1.82, status: "FAILED", created: "2026-01-15" },
  { id: "EXP-006", name: "Sector Rotation Q4", family: "Sector Rotation", hypothesis: "Monthly rebalancing into top 3 relative strength sectors with momentum confirmation.", runs: 8, bestReturn: 18.3, bestAlpha: 5.2, sharpe: 1.55, status: "COMPLETED", created: "2026-01-05" },
  { id: "EXP-007", name: "Event Catalyst v2", family: "Event Driven", hypothesis: "Pre-earnings momentum combined with post-earnings drift capturing using options.", runs: 6, bestReturn: 13.8, bestAlpha: 3.6, sharpe: 1.21, status: "DRAFT", created: "2026-03-01" },
  { id: "EXP-008", name: "Options Gamma Scalp", family: "Options", hypothesis: "Gamma scalping near expiry on high-OI strikes with dynamic rebalancing intervals.", runs: 20, bestReturn: 15.2, bestAlpha: 4.1, sharpe: 1.38, status: "RUNNING", created: "2026-02-25" },
  { id: "EXP-009", name: "Carry Trade Macro", family: "Momentum", hypothesis: "FX carry trade signals applied to Indian equity with cross-asset correlation filters.", runs: 9, bestReturn: 11.4, bestAlpha: 2.9, sharpe: 1.15, status: "COMPLETED", created: "2025-12-15" },
  { id: "EXP-010", name: "Gap Fill Reversal", family: "Mean Reversion", hypothesis: "Opening gap fills with intraday reversion targets calibrated on overnight futures data.", runs: 14, bestReturn: 16.9, bestAlpha: 5.8, sharpe: 1.52, status: "RUNNING", created: "2026-03-05" },
  { id: "EXP-011", name: "Trend Following v6", family: "Momentum", hypothesis: "Dual moving average crossover with ATR-based adaptive stops and position sizing.", runs: 42, bestReturn: 31.5, bestAlpha: 11.2, sharpe: 2.28, status: "COMPLETED", created: "2025-11-20" },
  { id: "EXP-012", name: "Iron Condor Weekly", family: "Options", hypothesis: "Weekly iron condors on NIFTY with probability of profit > 70% targeting 2% weekly.", runs: 16, bestReturn: 12.1, bestAlpha: 3.2, sharpe: 1.18, status: "FAILED", created: "2026-01-22" },
  { id: "EXP-013", name: "Dispersion Alpha v1", family: "Volatility", hypothesis: "Index vs single-stock volatility dispersion trading exploiting correlation breakdown.", runs: 7, bestReturn: 21.6, bestAlpha: 8.4, sharpe: 1.89, status: "RUNNING", created: "2026-03-08" },
  { id: "EXP-014", name: "Overnight Drift Capture", family: "Event Driven", hypothesis: "Systematic capture of overnight positive drift in large-cap equities with stop-loss at open.", runs: 11, bestReturn: 14.7, bestAlpha: 4.5, sharpe: 1.33, status: "COMPLETED", created: "2026-02-01" },
  { id: "EXP-015", name: "Cross-Sectional Mom v2", family: "Momentum", hypothesis: "Long top decile / short bottom decile on 12-1 month momentum with sector neutralization.", runs: 19, bestReturn: 29.3, bestAlpha: 10.8, sharpe: 2.19, status: "DRAFT", created: "2026-03-14" },
];

const families = [...new Set(experiments.map((e) => e.family))].sort();
const statuses = ["RUNNING", "COMPLETED", "FAILED", "DRAFT"];

const statusColor: Record<string, string> = {
  RUNNING: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  COMPLETED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
  DRAFT: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const PAGE_SIZE = 8;

export default function ExperimentsPage() {
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortField, setSortField] = useState<"bestReturn" | "sharpe" | "created" | "runs">("created");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = [...experiments];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.hypothesis.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q),
      );
    }
    if (familyFilter !== "All") list = list.filter((e) => e.family === familyFilter);
    if (statusFilter !== "All") list = list.filter((e) => e.status === statusFilter);
    list.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [search, familyFilter, statusFilter, sortField, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc((p) => !p);
    else { setSortField(field); setSortAsc(false); }
  };

  const activeFilters = (familyFilter !== "All" ? 1 : 0) + (statusFilter !== "All" ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Beaker className="w-6 h-6 text-blue-400" />
            Experiments
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            All strategy experiments across families &middot; {experiments.length} total
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Experiment
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px] bg-[#111118] rounded-lg px-3 py-2.5 border border-[#1e1e2e] focus-within:border-[#3b82f6]/50 transition-colors">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search experiments by name, hypothesis, or ID..."
            className="bg-transparent text-sm text-white placeholder-zinc-600 outline-none flex-1"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Family dropdown */}
        <div className="relative">
          <button
            onClick={() => { setFamilyOpen((p) => !p); setStatusOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-zinc-400 bg-[#111118] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors"
          >
            <Beaker className="w-3.5 h-3.5" />
            {familyFilter === "All" ? "Family" : familyFilter}
            <ChevronDown className={`w-3 h-3 transition-transform ${familyOpen ? "rotate-180" : ""}`} />
          </button>
          {familyOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl z-30 py-1">
              <button onClick={() => { setFamilyFilter("All"); setFamilyOpen(false); setPage(0); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e1e2e] transition-colors ${familyFilter === "All" ? "text-blue-400" : "text-zinc-400"}`}>
                All Families
              </button>
              {families.map((f) => (
                <button key={f} onClick={() => { setFamilyFilter(f); setFamilyOpen(false); setPage(0); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e1e2e] transition-colors ${familyFilter === f ? "text-blue-400" : "text-zinc-400"}`}>
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <button
            onClick={() => { setStatusOpen((p) => !p); setFamilyOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-zinc-400 bg-[#111118] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {statusFilter === "All" ? "Status" : statusFilter}
            <ChevronDown className={`w-3 h-3 transition-transform ${statusOpen ? "rotate-180" : ""}`} />
          </button>
          {statusOpen && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl z-30 py-1">
              <button onClick={() => { setStatusFilter("All"); setStatusOpen(false); setPage(0); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e1e2e] transition-colors ${statusFilter === "All" ? "text-blue-400" : "text-zinc-400"}`}>
                All Statuses
              </button>
              {statuses.map((s) => (
                <button key={s} onClick={() => { setStatusFilter(s); setStatusOpen(false); setPage(0); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e1e2e] transition-colors ${statusFilter === s ? "text-blue-400" : "text-zinc-400"}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range placeholder */}
        <button className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-zinc-400 bg-[#111118] border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors">
          <Calendar className="w-3.5 h-3.5" />
          Date Range
        </button>

        {/* Active filter count */}
        {activeFilters > 0 && (
          <button
            onClick={() => { setSearch(""); setFamilyFilter("All"); setStatusFilter("All"); setPage(0); }}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Experiments", value: experiments.length, color: "text-white" },
          { label: "Currently Running", value: experiments.filter((e) => e.status === "RUNNING").length, color: "text-emerald-400" },
          { label: "Completed", value: experiments.filter((e) => e.status === "COMPLETED").length, color: "text-blue-400" },
          { label: "Failed", value: experiments.filter((e) => e.status === "FAILED").length, color: "text-red-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                <th className="text-left py-3.5 px-4 font-medium w-[90px]">ID</th>
                <th className="text-left py-3.5 px-3 font-medium">Name</th>
                <th className="text-left py-3.5 px-3 font-medium">Family</th>
                <th className="text-left py-3.5 px-3 font-medium max-w-[260px]">Hypothesis</th>
                <th className="text-right py-3.5 px-3 font-medium cursor-pointer select-none" onClick={() => handleSort("runs")}>
                  <span className="inline-flex items-center gap-1">Runs <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-right py-3.5 px-3 font-medium cursor-pointer select-none" onClick={() => handleSort("bestReturn")}>
                  <span className="inline-flex items-center gap-1">Best Return% <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-right py-3.5 px-3 font-medium">Best Alpha%</th>
                <th className="text-right py-3.5 px-3 font-medium cursor-pointer select-none" onClick={() => handleSort("sharpe")}>
                  <span className="inline-flex items-center gap-1">Sharpe <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-center py-3.5 px-3 font-medium">Status</th>
                <th className="text-left py-3.5 px-4 font-medium cursor-pointer select-none" onClick={() => handleSort("created")}>
                  <span className="inline-flex items-center gap-1">Created <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-zinc-500">
                    No experiments match your filters.
                  </td>
                </tr>
              )}
              {paginated.map((exp) => (
                <Link key={exp.id} href={`/experiments/${exp.id}`} className="contents">
                  <tr className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors cursor-pointer group">
                    <td className="py-3.5 px-4 font-mono text-xs text-zinc-500">{exp.id}</td>
                    <td className="py-3.5 px-3 font-medium text-white group-hover:text-blue-400 transition-colors">{exp.name}</td>
                    <td className="py-3.5 px-3">
                      <span className="text-[10px] bg-[#1e1e2e] text-zinc-400 px-2 py-0.5 rounded whitespace-nowrap">{exp.family}</span>
                    </td>
                    <td className="py-3.5 px-3 text-zinc-500 text-xs max-w-[260px] truncate">{exp.hypothesis}</td>
                    <td className="py-3.5 px-3 text-right font-mono text-zinc-300">{exp.runs}</td>
                    <td className="py-3.5 px-3 text-right font-mono text-emerald-400">+{exp.bestReturn}%</td>
                    <td className="py-3.5 px-3 text-right font-mono text-blue-400">+{exp.bestAlpha}%</td>
                    <td className="py-3.5 px-3 text-right font-mono text-purple-400">{exp.sharpe}</td>
                    <td className="py-3.5 px-3 text-center">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${statusColor[exp.status]}`}>
                        {exp.status === "RUNNING" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />}
                        {exp.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-500 whitespace-nowrap">{exp.created}</td>
                    <td className="py-3.5 pr-3">
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                    </td>
                  </tr>
                </Link>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e1e2e]">
            <p className="text-xs text-zinc-500">
              Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} experiments
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-[#1e1e2e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                    page === i
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "text-zinc-500 hover:text-white hover:bg-[#1e1e2e]"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-[#1e1e2e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
