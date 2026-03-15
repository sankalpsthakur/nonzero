"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  User,
  Bot,
  Rocket,
  ShieldAlert,
  Zap,
  Code2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Approval {
  id: string;
  type: string;
  description: string;
  requester: string;
  requesterType: "human" | "agent";
  status: ApprovalStatus;
  urgency: Urgency;
  payload: Record<string, unknown>;
  createdAt: string;
  reviewer?: string;
  reviewedAt?: string;
  comment?: string;
}

// ── Mock Data ──────────────────────────────────────────────

const approvals: Approval[] = [
  // Pending
  {
    id: "APR-001",
    type: "DEPLOY_LIVE",
    description: "Promote MomentumAlpha v2.4 from shadow-live to live environment",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "PENDING",
    urgency: "HIGH",
    payload: { strategy: "MomentumAlpha", version: "2.4", fromEnv: "shadow-live", toEnv: "live", capitalRequired: 500000 },
    createdAt: "2026-03-15T09:45:00Z",
  },
  {
    id: "APR-002",
    type: "RISK_OVERRIDE",
    description: "Override max-position-size limit for NIFTY options expiry day",
    requester: "risk-manager-agent",
    requesterType: "agent",
    status: "PENDING",
    urgency: "CRITICAL",
    payload: { policy: "max-position-size", currentLimit: 1000000, requestedLimit: 2000000, duration: "4h", reason: "Expiry day hedging" },
    createdAt: "2026-03-15T08:30:00Z",
  },
  {
    id: "APR-003",
    type: "CAPITAL_ALLOCATION",
    description: "Allocate additional 10L capital to MeanReversion strategy pool",
    requester: "Sankalp",
    requesterType: "human",
    status: "PENDING",
    urgency: "MEDIUM",
    payload: { strategy: "MeanReversion", additionalCapital: 1000000, totalAfter: 2500000, source: "testing-credits" },
    createdAt: "2026-03-15T07:15:00Z",
  },
  {
    id: "APR-004",
    type: "NEW_INSTRUMENT",
    description: "Add BANKNIFTY weekly options to approved instrument universe",
    requester: "divergence-investigator",
    requesterType: "agent",
    status: "PENDING",
    urgency: "LOW",
    payload: { instruments: ["BANKNIFTY26MAR52000CE", "BANKNIFTY26MAR52000PE", "BANKNIFTY26MAR51500CE"], exchange: "NFO" },
    createdAt: "2026-03-14T22:10:00Z",
  },
  {
    id: "APR-005",
    type: "STRATEGY_MUTATION",
    description: "Modify stop-loss logic in StatArb v1.2 - replace fixed SL with trailing ATR-based SL",
    requester: "robustness-auditor",
    requesterType: "agent",
    status: "PENDING",
    urgency: "HIGH",
    payload: { strategy: "StatArb", version: "1.2", change: "stop-loss-logic", oldMethod: "fixed-2%", newMethod: "trailing-ATR(14)-1.5x" },
    createdAt: "2026-03-15T10:05:00Z",
  },
  // Approved
  {
    id: "APR-006",
    type: "DEPLOY_LIVE",
    description: "Promote PairTrader v3.1 from paper to shadow-live",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "MEDIUM",
    payload: { strategy: "PairTrader", version: "3.1", fromEnv: "paper", toEnv: "shadow-live" },
    createdAt: "2026-03-14T14:20:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-14T15:00:00Z",
    comment: "Backtests look solid. Shadow-live approved for 2 weeks.",
  },
  {
    id: "APR-007",
    type: "CAPITAL_ALLOCATION",
    description: "Initial capital allocation of 5L for new VolScalper strategy",
    requester: "Sankalp",
    requesterType: "human",
    status: "APPROVED",
    urgency: "LOW",
    payload: { strategy: "VolScalper", capital: 500000, environment: "paper" },
    createdAt: "2026-03-13T10:30:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-13T10:35:00Z",
    comment: "Self-approved for paper environment.",
  },
  {
    id: "APR-008",
    type: "RISK_OVERRIDE",
    description: "Temporary increase in daily loss limit from 50K to 75K for budget day",
    requester: "risk-manager-agent",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "HIGH",
    payload: { policy: "daily-loss-limit", oldLimit: 50000, newLimit: 75000, validUntil: "2026-03-15T15:30:00Z" },
    createdAt: "2026-03-14T08:00:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-14T08:45:00Z",
    comment: "Approved given budget day volatility expectations.",
  },
  {
    id: "APR-009",
    type: "STRATEGY_MUTATION",
    description: "Add RSI filter to MomentumAlpha entry conditions",
    requester: "robustness-auditor",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "MEDIUM",
    payload: { strategy: "MomentumAlpha", change: "entry-filter", filter: "RSI(14) > 55" },
    createdAt: "2026-03-12T16:40:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-12T18:00:00Z",
    comment: "RSI filter improves win rate by 4.2% in backtests.",
  },
  {
    id: "APR-010",
    type: "NEW_INSTRUMENT",
    description: "Add FINNIFTY monthly options to trading universe",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "LOW",
    payload: { instruments: ["FINNIFTY26MAR22000CE", "FINNIFTY26MAR22000PE"], exchange: "NFO" },
    createdAt: "2026-03-11T11:15:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-11T14:30:00Z",
    comment: "Added to universe. Liquidity checks passed.",
  },
  {
    id: "APR-011",
    type: "DEPLOY_LIVE",
    description: "Deploy StatArb v1.0 to paper environment",
    requester: "Sankalp",
    requesterType: "human",
    status: "APPROVED",
    urgency: "LOW",
    payload: { strategy: "StatArb", version: "1.0", toEnv: "paper" },
    createdAt: "2026-03-10T09:00:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-10T09:05:00Z",
    comment: "Initial paper deployment.",
  },
  {
    id: "APR-012",
    type: "CAPITAL_ALLOCATION",
    description: "Increase MomentumAlpha capital from 8L to 12L based on performance",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "MEDIUM",
    payload: { strategy: "MomentumAlpha", currentCapital: 800000, newCapital: 1200000, sharpeRatio: 2.1 },
    createdAt: "2026-03-09T15:20:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-09T16:00:00Z",
    comment: "Performance warrants scale-up. Sharpe > 2 for 30 days.",
  },
  {
    id: "APR-013",
    type: "STRATEGY_MUTATION",
    description: "Enable short-selling in PairTrader for NSE equities",
    requester: "robustness-auditor",
    requesterType: "agent",
    status: "APPROVED",
    urgency: "HIGH",
    payload: { strategy: "PairTrader", change: "enable-shorting", market: "NSE", condition: "intraday-only" },
    createdAt: "2026-03-08T12:00:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-08T13:30:00Z",
    comment: "Intraday shorting only. Must square off by 3:15 PM.",
  },
  // Rejected
  {
    id: "APR-014",
    type: "DEPLOY_LIVE",
    description: "Promote untested GammaScalper v0.1 directly to live",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "REJECTED",
    urgency: "CRITICAL",
    payload: { strategy: "GammaScalper", version: "0.1", fromEnv: "research", toEnv: "live", skipPaper: true },
    createdAt: "2026-03-14T09:00:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-14T09:15:00Z",
    comment: "Rejected: Cannot skip paper and shadow-live stages. Follow deployment pipeline.",
  },
  {
    id: "APR-015",
    type: "RISK_OVERRIDE",
    description: "Disable max drawdown circuit breaker during high-volatility event",
    requester: "risk-manager-agent",
    requesterType: "agent",
    status: "REJECTED",
    urgency: "CRITICAL",
    payload: { policy: "max-drawdown-breaker", action: "disable", reason: "Expected high volatility" },
    createdAt: "2026-03-13T07:30:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-13T07:45:00Z",
    comment: "Rejected: Circuit breakers must never be fully disabled. Raise threshold instead.",
  },
  {
    id: "APR-016",
    type: "CAPITAL_ALLOCATION",
    description: "Allocate 25L to experimental strategy with only 3 days of backtest data",
    requester: "frontier-explorer-agent",
    requesterType: "agent",
    status: "REJECTED",
    urgency: "HIGH",
    payload: { strategy: "ExperimentalAlpha", capital: 2500000, backtestDays: 3, sharpe: 4.8 },
    createdAt: "2026-03-12T11:00:00Z",
    reviewer: "Sankalp",
    reviewedAt: "2026-03-12T11:30:00Z",
    comment: "Rejected: Minimum 90 days of backtesting required. Sharpe likely overfitted with 3-day sample.",
  },
];

// ── Helpers ──────────────────────────────────────────────

const urgencyColors: Record<Urgency, string> = {
  LOW: "border-l-blue-500",
  MEDIUM: "border-l-amber-500",
  HIGH: "border-l-orange-500",
  CRITICAL: "border-l-red-500",
};

const urgencyBadgeColors: Record<Urgency, string> = {
  LOW: "bg-blue-500/20 text-blue-400",
  MEDIUM: "bg-amber-500/20 text-amber-400",
  HIGH: "bg-orange-500/20 text-orange-400",
  CRITICAL: "bg-red-500/20 text-red-400",
};

const typeBadgeColors: Record<string, string> = {
  DEPLOY_LIVE: "bg-purple-500/20 text-purple-400",
  RISK_OVERRIDE: "bg-red-500/20 text-red-400",
  CAPITAL_ALLOCATION: "bg-emerald-500/20 text-emerald-400",
  NEW_INSTRUMENT: "bg-blue-500/20 text-blue-400",
  STRATEGY_MUTATION: "bg-amber-500/20 text-amber-400",
};

const typeIcons: Record<string, React.ElementType> = {
  DEPLOY_LIVE: Rocket,
  RISK_OVERRIDE: ShieldAlert,
  CAPITAL_ALLOCATION: Zap,
  NEW_INSTRUMENT: Code2,
  STRATEGY_MUTATION: Code2,
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ──────────────────────────────────────────────

const tabs = ["Pending", "Approved", "Rejected"] as const;
type Tab = (typeof tabs)[number];

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Pending");
  const [expandedPayload, setExpandedPayload] = useState<string | null>(null);

  const statusMap: Record<Tab, ApprovalStatus> = {
    Pending: "PENDING",
    Approved: "APPROVED",
    Rejected: "REJECTED",
  };

  const filtered = approvals.filter((a) => a.status === statusMap[activeTab]);

  const counts = {
    Pending: approvals.filter((a) => a.status === "PENDING").length,
    Approved: approvals.filter((a) => a.status === "APPROVED").length,
    Rejected: approvals.filter((a) => a.status === "REJECTED").length,
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-blue-500" />
            Approvals
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Review and manage agent and deployment approval requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            {counts.Pending} awaiting review
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl bg-[#111118] border border-[#1e1e2e] p-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          const Icon =
            tab === "Pending"
              ? Clock
              : tab === "Approved"
                ? CheckCircle2
                : XCircle;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#1e1e2e] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isActive
                    ? tab === "Pending"
                      ? "bg-amber-500/20 text-amber-400"
                      : tab === "Approved"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    : "bg-[#1e1e2e] text-zinc-500"
                }`}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((approval) => {
          const TypeIcon = typeIcons[approval.type] || Code2;
          const isExpanded = expandedPayload === approval.id;

          return (
            <div
              key={approval.id}
              className={`border-l-4 ${
                approval.status === "PENDING"
                  ? urgencyColors[approval.urgency]
                  : approval.status === "APPROVED"
                    ? "border-l-emerald-500"
                    : "border-l-red-500"
              } rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden transition-all hover:bg-[#16161f]`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Type icon */}
                    <div className="w-10 h-10 rounded-lg bg-[#1e1e2e] flex items-center justify-center shrink-0">
                      <TypeIcon className="h-5 w-5 text-zinc-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top row: badges */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${typeBadgeColors[approval.type] || "bg-zinc-500/20 text-zinc-400"}`}
                        >
                          {approval.type.replace(/_/g, " ")}
                        </span>
                        {approval.status === "PENDING" && (
                          <span
                            className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${urgencyBadgeColors[approval.urgency]}`}
                          >
                            {approval.urgency}
                          </span>
                        )}
                        <span className="text-xs text-zinc-600 font-mono">
                          {approval.id}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {approval.description}
                      </p>

                      {/* Requester & time */}
                      <div className="flex items-center gap-4 mt-2.5 text-xs text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          {approval.requesterType === "agent" ? (
                            <Bot className="h-3.5 w-3.5 text-purple-400" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-blue-400" />
                          )}
                          {approval.requester}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {timeAgo(approval.createdAt)}
                        </span>
                      </div>

                      {/* Reviewer info for approved/rejected */}
                      {approval.reviewer && (
                        <div className="mt-3 pt-3 border-t border-[#1e1e2e]">
                          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-1.5">
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              Reviewed by {approval.reviewer}
                            </span>
                            <span>
                              {formatTimestamp(approval.reviewedAt!)}
                            </span>
                          </div>
                          {approval.comment && (
                            <p className="text-xs text-zinc-400 italic bg-[#0a0a0f] rounded-lg px-3 py-2 border border-[#1e1e2e]">
                              &ldquo;{approval.comment}&rdquo;
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expandable payload */}
                      <button
                        onClick={() =>
                          setExpandedPayload(isExpanded ? null : approval.id)
                        }
                        className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 mt-2.5 transition-colors"
                      >
                        <ChevronRight
                          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                        {isExpanded ? "Hide" : "View"} payload
                      </button>
                    </div>
                  </div>

                  {/* Action buttons for pending */}
                  {approval.status === "PENDING" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                      <button className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    </div>
                  )}

                  {/* Status badge for approved/rejected */}
                  {approval.status === "APPROVED" && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approved
                    </span>
                  )}
                  {approval.status === "REJECTED" && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 shrink-0">
                      <XCircle className="h-3.5 w-3.5" />
                      Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded payload JSON */}
              {isExpanded && (
                <div className="border-t border-[#1e1e2e] bg-[#0a0a0f] px-5 py-4">
                  <pre className="text-xs font-mono text-zinc-400 overflow-x-auto leading-relaxed">
                    {JSON.stringify(approval.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <ShieldCheck className="h-12 w-12 mb-3" />
          <p className="text-sm">No {activeTab.toLowerCase()} approvals</p>
        </div>
      )}
    </div>
  );
}
