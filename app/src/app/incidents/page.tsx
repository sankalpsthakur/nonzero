"use client";

import { useState } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Search,
  CheckCircle2,
  Clock,
  Shield,
  TrendingDown,
  Unplug,
  Bug,
  Gauge,
  ChevronDown,
  ChevronRight,
  Activity,
  MessageSquare,
  User,
  Bot,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED";

interface TimelineEvent {
  timestamp: string;
  actor: string;
  actorType: "human" | "agent" | "system";
  action: string;
  detail?: string;
}

interface Incident {
  id: string;
  type: string;
  typeIcon: React.ElementType;
  severity: Severity;
  status: IncidentStatus;
  description: string;
  affectedDeployment: string;
  divergenceScore?: number;
  createdAt: string;
  resolvedAt?: string;
  timeline: TimelineEvent[];
}

// ── Mock Data ──────────────────────────────────────────────

const incidents: Incident[] = [
  {
    id: "INC-001",
    type: "DIVERGENCE",
    typeIcon: TrendingDown,
    severity: "CRITICAL",
    status: "OPEN",
    description: "Live execution diverged >15% from expected shadow-live P&L on MomentumAlpha. Potential slippage issue or signal drift detected.",
    affectedDeployment: "MomentumAlpha v2.4 (live)",
    divergenceScore: 18.3,
    createdAt: "2026-03-15T10:23:00Z",
    timeline: [
      { timestamp: "2026-03-15T10:23:00Z", actor: "system", actorType: "system", action: "Incident created", detail: "Auto-detected divergence threshold breach (18.3% > 15%)" },
      { timestamp: "2026-03-15T10:24:30Z", actor: "risk-monitor-agent", actorType: "agent", action: "Alert escalated", detail: "Notified workspace owner via webhook" },
      { timestamp: "2026-03-15T10:30:00Z", actor: "Sankalp", actorType: "human", action: "Acknowledged", detail: "Looking into RELIANCE fill quality" },
    ],
  },
  {
    id: "INC-002",
    type: "CIRCUIT_BREAKER",
    typeIcon: Shield,
    severity: "HIGH",
    status: "INVESTIGATING",
    description: "Daily loss limit breached for PairTrader shadow-live. Circuit breaker triggered, pausing all new orders.",
    affectedDeployment: "PairTrader v3.1 (shadow-live)",
    createdAt: "2026-03-15T09:45:00Z",
    timeline: [
      { timestamp: "2026-03-15T09:45:00Z", actor: "system", actorType: "system", action: "Circuit breaker triggered", detail: "Daily loss -52,340 exceeded limit of -50,000" },
      { timestamp: "2026-03-15T09:45:05Z", actor: "risk-monitor-agent", actorType: "agent", action: "Orders paused", detail: "All pending orders cancelled, new orders blocked" },
      { timestamp: "2026-03-15T09:50:00Z", actor: "Sankalp", actorType: "human", action: "Investigation started", detail: "Analyzing HDFCBANK-ICICIBANK pair for adverse move" },
      { timestamp: "2026-03-15T10:10:00Z", actor: "robustness-auditor", actorType: "agent", action: "Root cause proposed", detail: "Correlation breakdown between HDFCBANK and ICICIBANK due to HDFCBANK results" },
    ],
  },
  {
    id: "INC-003",
    type: "API_FAILURE",
    typeIcon: Unplug,
    severity: "HIGH",
    status: "RESOLVED",
    description: "Zerodha Kite API returned 5xx errors for 12 minutes during market hours. Orders queued locally.",
    affectedDeployment: "All live deployments",
    createdAt: "2026-03-14T11:15:00Z",
    resolvedAt: "2026-03-14T11:27:00Z",
    timeline: [
      { timestamp: "2026-03-14T11:15:00Z", actor: "system", actorType: "system", action: "API errors detected", detail: "5 consecutive 503 responses from Kite API" },
      { timestamp: "2026-03-14T11:15:30Z", actor: "system", actorType: "system", action: "Failover activated", detail: "Orders queued locally. Retry backoff: 2s, 4s, 8s..." },
      { timestamp: "2026-03-14T11:27:00Z", actor: "system", actorType: "system", action: "API recovered", detail: "Kite API responding normally. 3 queued orders flushed." },
      { timestamp: "2026-03-14T11:30:00Z", actor: "Sankalp", actorType: "human", action: "Post-mortem noted", detail: "Zerodha upstream issue. No fills missed." },
    ],
  },
  {
    id: "INC-004",
    type: "EXECUTION_ERROR",
    typeIcon: Bug,
    severity: "MEDIUM",
    status: "OPEN",
    description: "StatArb paper trading encountered repeated order rejection for TATAMOTORS due to lot size mismatch.",
    affectedDeployment: "StatArb v1.2 (paper)",
    createdAt: "2026-03-15T08:30:00Z",
    timeline: [
      { timestamp: "2026-03-15T08:30:00Z", actor: "system", actorType: "system", action: "Order rejected", detail: "TATAMOTORS qty 150 not a valid lot size (lot=425)" },
      { timestamp: "2026-03-15T08:30:05Z", actor: "system", actorType: "system", action: "Retry failed", detail: "Same rejection on retry" },
    ],
  },
  {
    id: "INC-005",
    type: "RISK_BREACH",
    typeIcon: Gauge,
    severity: "MEDIUM",
    status: "RESOLVED",
    description: "Position concentration exceeded 40% in RELIANCE for MomentumAlpha. Auto-hedging kicked in.",
    affectedDeployment: "MomentumAlpha v2.4 (live)",
    divergenceScore: 5.2,
    createdAt: "2026-03-13T14:20:00Z",
    resolvedAt: "2026-03-13T14:35:00Z",
    timeline: [
      { timestamp: "2026-03-13T14:20:00Z", actor: "system", actorType: "system", action: "Concentration breach", detail: "RELIANCE weight 42.1% > 40% limit" },
      { timestamp: "2026-03-13T14:20:30Z", actor: "risk-monitor-agent", actorType: "agent", action: "Auto-hedge initiated", detail: "Selling 30 shares of RELIANCE to bring weight below 38%" },
      { timestamp: "2026-03-13T14:35:00Z", actor: "system", actorType: "system", action: "Resolved", detail: "RELIANCE weight now 37.8%. Within limits." },
    ],
  },
  {
    id: "INC-006",
    type: "DIVERGENCE",
    typeIcon: TrendingDown,
    severity: "LOW",
    status: "RESOLVED",
    description: "Minor divergence (3.2%) between paper and shadow-live P&L for VolScalper. Within acceptable range but logged.",
    affectedDeployment: "VolScalper v0.8 (paper)",
    divergenceScore: 3.2,
    createdAt: "2026-03-12T15:45:00Z",
    resolvedAt: "2026-03-12T16:00:00Z",
    timeline: [
      { timestamp: "2026-03-12T15:45:00Z", actor: "system", actorType: "system", action: "Divergence logged", detail: "3.2% divergence between paper and expected. Informational." },
      { timestamp: "2026-03-12T16:00:00Z", actor: "robustness-auditor", actorType: "agent", action: "Auto-resolved", detail: "Divergence within 5% threshold. Tagged as informational." },
    ],
  },
  {
    id: "INC-007",
    type: "CIRCUIT_BREAKER",
    typeIcon: Shield,
    severity: "CRITICAL",
    status: "RESOLVED",
    description: "Global kill switch was manually triggered during flash crash event. All live trading halted for 45 minutes.",
    affectedDeployment: "All live deployments",
    createdAt: "2026-03-10T10:02:00Z",
    resolvedAt: "2026-03-10T10:47:00Z",
    timeline: [
      { timestamp: "2026-03-10T10:02:00Z", actor: "Sankalp", actorType: "human", action: "Kill switch activated", detail: "Manual activation during NIFTY flash crash (-2.3% in 5 min)" },
      { timestamp: "2026-03-10T10:02:30Z", actor: "system", actorType: "system", action: "All orders cancelled", detail: "14 open orders cancelled. 6 positions held." },
      { timestamp: "2026-03-10T10:35:00Z", actor: "Sankalp", actorType: "human", action: "Market stabilized", detail: "NIFTY recovered to -0.8%. Preparing to resume." },
      { timestamp: "2026-03-10T10:47:00Z", actor: "Sankalp", actorType: "human", action: "Kill switch deactivated", detail: "Trading resumed. P&L impact: -18,420." },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────

const severityColors: Record<Severity, { bg: string; text: string; border: string; dot: string }> = {
  LOW: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500", dot: "bg-blue-400" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500", dot: "bg-amber-400" },
  HIGH: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500", dot: "bg-orange-400" },
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500", dot: "bg-red-400" },
};

const statusColors: Record<IncidentStatus, { bg: string; text: string }> = {
  OPEN: { bg: "bg-red-500/20", text: "text-red-400" },
  INVESTIGATING: { bg: "bg-amber-500/20", text: "text-amber-400" },
  RESOLVED: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ── Component ──────────────────────────────────────────────

export default function IncidentsPage() {
  const [expandedIncident, setExpandedIncident] = useState<string | null>(
    "INC-001",
  );

  const stats = {
    open: incidents.filter((i) => i.status === "OPEN").length,
    investigating: incidents.filter((i) => i.status === "INVESTIGATING").length,
    resolved: incidents.filter((i) => i.status === "RESOLVED").length,
    total: incidents.length,
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <AlertTriangle className="h-7 w-7 text-amber-500" />
            Incidents
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Monitor and manage system incidents and anomalies
          </p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Open",
            value: stats.open,
            icon: AlertOctagon,
            color: "text-red-400",
            bg: "bg-red-500/10",
            border: "border-red-500/20",
          },
          {
            label: "Investigating",
            value: stats.investigating,
            icon: Search,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
          },
          {
            label: "Resolved",
            value: stats.resolved,
            icon: CheckCircle2,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
          },
          {
            label: "Total",
            value: stats.total,
            icon: Activity,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border ${stat.border} ${stat.bg} p-5`}
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                {stat.label}
              </span>
            </div>
            <p className={`text-3xl font-bold font-mono ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {incidents.map((incident) => {
          const sev = severityColors[incident.severity];
          const st = statusColors[incident.status];
          const isExpanded = expandedIncident === incident.id;
          const TypeIcon = incident.typeIcon;

          return (
            <div
              key={incident.id}
              className={`rounded-xl border border-[#1e1e2e] bg-[#111118] overflow-hidden transition-all ${
                incident.status !== "RESOLVED" ? "border-l-4 " + sev.border : ""
              }`}
            >
              {/* Incident Header */}
              <button
                onClick={() =>
                  setExpandedIncident(isExpanded ? null : incident.id)
                }
                className="w-full p-5 text-left hover:bg-[#16161f] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Type Icon */}
                    <div
                      className={`w-10 h-10 rounded-lg ${sev.bg} flex items-center justify-center shrink-0`}
                    >
                      <TypeIcon className={`h-5 w-5 ${sev.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${sev.bg} ${sev.text}`}
                        >
                          {incident.severity}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${st.bg} ${st.text}`}
                        >
                          {incident.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-zinc-600 font-mono">
                          {incident.id}
                        </span>
                        {incident.divergenceScore != null && (
                          <span className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" />
                            Div: {incident.divergenceScore}%
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {incident.description}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <Activity className="h-3 w-3" />
                          {incident.affectedDeployment}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {timeAgo(incident.createdAt)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-3 w-3" />
                          {incident.timeline.length} events
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    className={`h-5 w-5 text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Expanded Timeline */}
              {isExpanded && (
                <div className="border-t border-[#1e1e2e] bg-[#0a0a0f] p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                    Incident Timeline
                  </h3>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[#1e1e2e]" />

                    <div className="space-y-4">
                      {incident.timeline.map((event, idx) => (
                        <div key={idx} className="relative flex items-start gap-4 pl-10">
                          {/* Timeline dot */}
                          <div className="absolute left-[14px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0f] bg-[#2a2a3a] z-10">
                            {idx === 0 && (
                              <div className={`absolute inset-0 rounded-full ${sev.dot}`} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-zinc-300">
                                {event.action}
                              </span>
                              <span className="text-[10px] text-zinc-600 font-mono">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {event.detail && (
                              <p className="text-xs text-zinc-500 leading-relaxed">
                                {event.detail}
                              </p>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600 mt-1">
                              {event.actorType === "human" ? (
                                <User className="h-3 w-3" />
                              ) : event.actorType === "agent" ? (
                                <Bot className="h-3 w-3" />
                              ) : (
                                <Activity className="h-3 w-3" />
                              )}
                              {event.actor}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
