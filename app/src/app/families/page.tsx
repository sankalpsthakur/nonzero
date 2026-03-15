import Link from "next/link";
import {
  FolderTree,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Tag,
  ChevronRight,
  Beaker,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Pause,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type FamilyStatus = "active" | "researching" | "paused" | "archived";

interface StrategyFamily {
  id: string;
  name: string;
  slug: string;
  objective: string;
  benchmark: string;
  versionCount: number;
  latestVersion: string;
  status: FamilyStatus;
  bestSharpe: number;
  bestReturn: number;
  bestWinRate: number;
  sparkline: number[];
  createdAt: string;
  lastUpdated: string;
  deployments: number;
}

// ── Mock Data ──────────────────────────────────────────────

const families: StrategyFamily[] = [
  {
    id: "FAM-001",
    name: "MomentumAlpha",
    slug: "momentum-alpha",
    objective: "Capture short-term momentum in NSE large-cap equities using price-volume signals and ML-based entry timing",
    benchmark: "NIFTY 50",
    versionCount: 12,
    latestVersion: "v2.4",
    status: "active",
    bestSharpe: 2.14,
    bestReturn: 28.4,
    bestWinRate: 62.3,
    sparkline: [10, 15, 12, 22, 18, 25, 20, 28, 24, 32, 27, 35],
    createdAt: "2025-11-10T09:00:00Z",
    lastUpdated: "2026-03-15T10:00:00Z",
    deployments: 2,
  },
  {
    id: "FAM-002",
    name: "MeanReversion",
    slug: "mean-reversion",
    objective: "Exploit mean-reverting behavior in mid-cap stocks with Bollinger Band-based entries and ATR-based risk management",
    benchmark: "NIFTY MIDCAP 100",
    versionCount: 8,
    latestVersion: "v2.0",
    status: "active",
    bestSharpe: 2.56,
    bestReturn: 35.2,
    bestWinRate: 64.8,
    sparkline: [5, 8, 12, 10, 18, 22, 19, 28, 32, 29, 38, 42],
    createdAt: "2025-10-05T09:00:00Z",
    lastUpdated: "2026-03-14T15:00:00Z",
    deployments: 1,
  },
  {
    id: "FAM-003",
    name: "PairTrader",
    slug: "pair-trader",
    objective: "Statistical arbitrage on cointegrated stock pairs from banking and IT sectors with dynamic hedge ratios",
    benchmark: "NIFTY BANK",
    versionCount: 6,
    latestVersion: "v3.1",
    status: "active",
    bestSharpe: 1.78,
    bestReturn: 18.6,
    bestWinRate: 58.7,
    sparkline: [8, 12, 10, 14, 16, 13, 18, 15, 20, 22, 19, 24],
    createdAt: "2025-12-20T09:00:00Z",
    lastUpdated: "2026-03-12T11:00:00Z",
    deployments: 1,
  },
  {
    id: "FAM-004",
    name: "StatArb",
    slug: "stat-arb",
    objective: "Multi-factor statistical arbitrage across NSE stocks using PCA-based factor models and residual momentum",
    benchmark: "NIFTY 500",
    versionCount: 5,
    latestVersion: "v1.2",
    status: "researching",
    bestSharpe: 1.45,
    bestReturn: 14.2,
    bestWinRate: 51.2,
    sparkline: [3, 5, 4, 8, 6, 10, 8, 12, 9, 14, 11, 16],
    createdAt: "2026-01-15T09:00:00Z",
    lastUpdated: "2026-03-15T08:00:00Z",
    deployments: 1,
  },
  {
    id: "FAM-005",
    name: "VolScalper",
    slug: "vol-scalper",
    objective: "Scalp implied volatility mispricings in NIFTY/BANKNIFTY weekly options using vol surface modeling",
    benchmark: "NIFTY 50",
    versionCount: 3,
    latestVersion: "v0.8",
    status: "researching",
    bestSharpe: 0.92,
    bestReturn: 8.5,
    bestWinRate: 55.1,
    sparkline: [2, 4, 3, 6, 5, 8, 6, 9, 7, 10, 8, 12],
    createdAt: "2026-02-01T09:00:00Z",
    lastUpdated: "2026-03-10T14:00:00Z",
    deployments: 1,
  },
  {
    id: "FAM-006",
    name: "GammaScalper",
    slug: "gamma-scalper",
    objective: "Delta-hedged gamma scalping on NIFTY options, capturing realized vs implied vol spread",
    benchmark: "NIFTY 50",
    versionCount: 1,
    latestVersion: "v0.1",
    status: "researching",
    bestSharpe: 0,
    bestReturn: 0,
    bestWinRate: 0,
    sparkline: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    createdAt: "2026-03-13T09:00:00Z",
    lastUpdated: "2026-03-15T09:00:00Z",
    deployments: 0,
  },
  {
    id: "FAM-007",
    name: "SectorRotation",
    slug: "sector-rotation",
    objective: "Rotate between NSE sectoral indices based on relative strength and macroeconomic regime signals",
    benchmark: "NIFTY 50",
    versionCount: 4,
    latestVersion: "v1.1",
    status: "paused",
    bestSharpe: 1.32,
    bestReturn: 12.8,
    bestWinRate: 54.3,
    sparkline: [6, 9, 8, 12, 10, 14, 11, 8, 6, 5, 4, 3],
    createdAt: "2025-11-25T09:00:00Z",
    lastUpdated: "2026-02-28T16:00:00Z",
    deployments: 0,
  },
  {
    id: "FAM-008",
    name: "BreakoutHunter",
    slug: "breakout-hunter",
    objective: "Identify and trade consolidation breakouts in NSE stocks with volume confirmation and momentum filters",
    benchmark: "NIFTY NEXT 50",
    versionCount: 7,
    latestVersion: "v1.5",
    status: "paused",
    bestSharpe: 1.65,
    bestReturn: 22.1,
    bestWinRate: 48.2,
    sparkline: [12, 18, 22, 28, 24, 20, 15, 10, 8, 12, 9, 6],
    createdAt: "2025-09-15T09:00:00Z",
    lastUpdated: "2026-03-01T10:00:00Z",
    deployments: 0,
  },
];

// ── Helpers ──────────────────────────────────────────────

const statusConfig: Record<FamilyStatus, { bg: string; text: string; icon: React.ElementType }> = {
  active: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  researching: { bg: "bg-blue-500/20", text: "text-blue-400", icon: Beaker },
  paused: { bg: "bg-amber-500/20", text: "text-amber-400", icon: Pause },
  archived: { bg: "bg-zinc-500/20", text: "text-zinc-400", icon: FolderTree },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.every((d) => d === 0)) {
    return <div className="text-xs text-zinc-600 italic">No data yet</div>;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  const stepX = width / (data.length - 1);

  const points = data
    .map((d, i) => `${i * stepX},${height - ((d - min) / range) * height}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Component ──────────────────────────────────────────────

export default function FamiliesPage() {
  const activeFamilies = families.filter((f) => f.status === "active").length;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <FolderTree className="h-7 w-7 text-purple-500" />
            Strategy Families
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Strategy family registry and version management
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20">
          <Plus className="h-4 w-4" />
          Create Family
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>
          {families.length} families &middot; {activeFamilies} active &middot;{" "}
          {families.reduce((s, f) => s + f.versionCount, 0)} total versions
        </span>
      </div>

      {/* Family Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {families.map((family) => {
          const sc = statusConfig[family.status];
          const StatusIcon = sc.icon;
          const sparklineColor =
            family.status === "active"
              ? "#10b981"
              : family.status === "researching"
                ? "#3b82f6"
                : "#71717a";

          return (
            <Link
              key={family.id}
              href={`/families/${family.id}`}
              className="group rounded-xl border border-[#1e1e2e] bg-[#111118] p-5 hover:bg-[#16161f] hover:border-[#2a2a3a] transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                    {family.name}
                  </h3>
                  <p className="text-xs text-zinc-600 font-mono">/{family.slug}</p>
                </div>
                <span
                  className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 ${sc.bg} ${sc.text}`}
                >
                  <StatusIcon className="h-3 w-3" />
                  {family.status}
                </span>
              </div>

              {/* Objective */}
              <p className="text-xs text-zinc-500 leading-relaxed mb-4 line-clamp-2">
                {family.objective}
              </p>

              {/* Sparkline + Metrics */}
              <div className="flex items-end justify-between mb-4">
                <MiniSparkline data={family.sparkline} color={sparklineColor} />
                <div className="text-right">
                  {family.bestSharpe > 0 ? (
                    <>
                      <p className="text-xs text-zinc-600">Best Sharpe</p>
                      <p
                        className={`text-lg font-bold font-mono ${
                          family.bestSharpe >= 2
                            ? "text-emerald-400"
                            : family.bestSharpe >= 1
                              ? "text-amber-400"
                              : "text-zinc-400"
                        }`}
                      >
                        {family.bestSharpe.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600 italic">No metrics</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
                {family.bestReturn > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">{family.bestReturn}%</span>
                  </span>
                )}
                {family.bestWinRate > 0 && (
                  <span>WR: {family.bestWinRate}%</span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[#1e1e2e]">
                <div className="flex items-center gap-3 text-xs text-zinc-600">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {family.versionCount} versions
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {family.benchmark}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-600">
                  <Clock className="h-3 w-3" />
                  {timeAgo(family.lastUpdated)}
                </div>
              </div>

              {/* Deployments badge */}
              {family.deployments > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <Activity className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">{family.deployments} live deployment{family.deployments !== 1 && "s"}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
