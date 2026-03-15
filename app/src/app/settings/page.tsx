"use client";

import { useState } from "react";
import {
  Settings,
  Users,
  Shield,
  Landmark,
  FileText,
  Save,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Key,
  ToggleLeft,
  ToggleRight,
  Clock,
  User,
  Bot,
  Activity,
  ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

type SettingsTab = "general" | "members" | "broker" | "risk" | "audit";

interface Member {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "collaborator" | "viewer";
  lastActive: string;
  avatar: string;
}

interface RiskPolicySetting {
  id: string;
  name: string;
  type: string;
  threshold: string;
  enabled: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  actorType: "human" | "agent" | "system";
  target: string;
  timestamp: string;
  detail?: string;
}

// ── Mock Data ──────────────────────────────────────────────

const members: Member[] = [
  { id: "M-001", name: "Sankalp", email: "sankalp@nonzero.app", role: "owner", lastActive: "2026-03-15T10:30:00Z", avatar: "S" },
  { id: "M-002", name: "Priya", email: "priya@nonzero.app", role: "admin", lastActive: "2026-03-15T09:45:00Z", avatar: "P" },
  { id: "M-003", name: "Rahul", email: "rahul@nonzero.app", role: "collaborator", lastActive: "2026-03-14T18:20:00Z", avatar: "R" },
  { id: "M-004", name: "Ananya", email: "ananya@nonzero.app", role: "viewer", lastActive: "2026-03-13T14:00:00Z", avatar: "A" },
];

const riskSettings: RiskPolicySetting[] = [
  { id: "RS-001", name: "Max Daily Loss", type: "LOSS", threshold: "50,000", enabled: true },
  { id: "RS-002", name: "Max Position Size", type: "POSITION", threshold: "10,00,000", enabled: true },
  { id: "RS-003", name: "Max Drawdown Breaker", type: "LOSS", threshold: "2,00,000", enabled: true },
  { id: "RS-004", name: "Position Concentration", type: "CONCENTRATION", threshold: "40%", enabled: true },
  { id: "RS-005", name: "Max Open Orders", type: "EXECUTION", threshold: "25", enabled: true },
  { id: "RS-006", name: "Options Notional Limit", type: "PORTFOLIO", threshold: "30,00,000", enabled: false },
];

const auditLog: AuditEntry[] = [
  { id: "AUD-001", action: "Risk policy updated", actor: "Sankalp", actorType: "human", target: "Max Daily Loss", timestamp: "2026-03-15T10:15:00Z", detail: "Threshold changed from 40K to 50K" },
  { id: "AUD-002", action: "Member invited", actor: "Sankalp", actorType: "human", target: "ananya@nonzero.app", timestamp: "2026-03-14T16:00:00Z", detail: "Role: viewer" },
  { id: "AUD-003", action: "Kill switch activated", actor: "Sankalp", actorType: "human", target: "Global", timestamp: "2026-03-14T11:15:00Z", detail: "Manual activation during API outage" },
  { id: "AUD-004", action: "Strategy deployed", actor: "frontier-explorer", actorType: "agent", target: "MomentumAlpha v2.4", timestamp: "2026-03-14T09:15:00Z", detail: "Promoted to shadow-live" },
  { id: "AUD-005", action: "Broker reconnected", actor: "system", actorType: "system", target: "Zerodha Kite", timestamp: "2026-03-14T06:15:00Z", detail: "Auto-reconnect on session start" },
  { id: "AUD-006", action: "Approval granted", actor: "Sankalp", actorType: "human", target: "APR-006", timestamp: "2026-03-13T15:00:00Z", detail: "PairTrader v3.1 to shadow-live" },
  { id: "AUD-007", action: "Credits topped up", actor: "Sankalp", actorType: "human", target: "Workspace balance", timestamp: "2026-03-13T12:00:00Z", detail: "+25,000 via Razorpay" },
  { id: "AUD-008", action: "Risk policy toggled", actor: "Sankalp", actorType: "human", target: "Options Notional Limit", timestamp: "2026-03-13T10:00:00Z", detail: "Disabled" },
  { id: "AUD-009", action: "Member role changed", actor: "Sankalp", actorType: "human", target: "Priya", timestamp: "2026-03-12T14:30:00Z", detail: "collaborator -> admin" },
  { id: "AUD-010", action: "Workspace name updated", actor: "Sankalp", actorType: "human", target: "Workspace", timestamp: "2026-03-12T10:00:00Z", detail: "Renamed to 'My Alpha Lab'" },
];

// ── Helpers ──────────────────────────────────────────────

const roleColors: Record<string, string> = {
  owner: "bg-purple-500/20 text-purple-400",
  admin: "bg-blue-500/20 text-blue-400",
  collaborator: "bg-emerald-500/20 text-emerald-400",
  viewer: "bg-zinc-500/20 text-zinc-400",
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
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

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "members", label: "Members", icon: Users },
  { id: "broker", label: "Broker", icon: Landmark },
  { id: "risk", label: "Risk Policies", icon: Shield },
  { id: "audit", label: "Audit Log", icon: FileText },
];

// ── Component ──────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [wsName, setWsName] = useState("My Alpha Lab");
  const [wsSlug, setWsSlug] = useState("my-alpha-lab");
  const [policies, setPolicies] = useState(riskSettings);

  function togglePolicy(id: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="h-7 w-7 text-zinc-400" />
          Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage workspace configuration, members, and policies
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl bg-[#111118] border border-[#1e1e2e] p-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#1e1e2e] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl">
        {/* General Tab */}
        {activeTab === "general" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-1">Workspace Details</h2>
              <p className="text-xs text-zinc-500">Update your workspace name and identifier</p>
            </div>
            <div className="max-w-lg space-y-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Workspace Name</label>
                <input
                  type="text"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Slug</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={wsSlug}
                    onChange={(e) => setWsSlug(e.target.value)}
                    className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm font-mono text-zinc-400 focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">URL: nonzero.app/{wsSlug}</p>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Workspace Type</label>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                    SOLO_LAB
                  </span>
                </div>
              </div>
              <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
                <Save className="h-4 w-4" />
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === "members" && (
          <div>
            <div className="p-6 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Members</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{members.length} workspace members</p>
              </div>
              <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Invite Member
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                    <th className="text-left py-3 px-6 font-medium">Member</th>
                    <th className="text-left py-3 px-3 font-medium">Email</th>
                    <th className="text-center py-3 px-3 font-medium">Role</th>
                    <th className="text-right py-3 px-3 font-medium">Last Active</th>
                    <th className="text-right py-3 px-6 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#1e1e2e] flex items-center justify-center text-xs font-bold text-zinc-400">
                            {m.avatar}
                          </div>
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400 text-xs">{m.email}</td>
                      <td className="py-3 px-3 text-center">
                        {m.role === "owner" ? (
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${roleColors[m.role]}`}>
                            {m.role}
                          </span>
                        ) : (
                          <select
                            defaultValue={m.role}
                            className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#2a2a3a] text-zinc-300 focus:outline-none focus:border-blue-500"
                          >
                            <option value="admin">Admin</option>
                            <option value="collaborator">Collaborator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-xs text-zinc-500">
                        {timeAgo(m.lastActive)}
                      </td>
                      <td className="py-3 px-6 text-right">
                        {m.role !== "owner" && (
                          <button className="text-zinc-600 hover:text-red-400 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Broker Tab */}
        {activeTab === "broker" && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-1">Broker Configuration</h2>
              <p className="text-xs text-zinc-500">Manage your Zerodha Kite Connect integration</p>
            </div>

            <div className="max-w-lg space-y-4">
              <div className="rounded-xl border border-[#1e1e2e] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Landmark className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Zerodha Kite</p>
                      <p className="text-xs text-zinc-500">Broker connection</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Connected
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">API Key</label>
                    <div className="flex items-center gap-2 rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5">
                      <Key className="h-4 w-4 text-zinc-600" />
                      <span className="text-sm font-mono text-zinc-400">kite_••••••••••••a7x9</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">User ID</span>
                      <p className="font-mono text-white">ZR4821</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Session Expires</span>
                      <p className="font-mono text-amber-400">2026-03-16 03:30</p>
                    </div>
                  </div>
                </div>
              </div>

              <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
                <Pencil className="h-4 w-4" />
                Update API Key
              </button>
            </div>
          </div>
        )}

        {/* Risk Policies Tab */}
        {activeTab === "risk" && (
          <div>
            <div className="p-6 border-b border-[#1e1e2e] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Risk Policies</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Configure risk limits and circuit breakers</p>
              </div>
              <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors">
                <Plus className="h-3.5 w-3.5" />
                Add Policy
              </button>
            </div>
            <div className="divide-y divide-[#1e1e2e]">
              {policies.map((policy) => (
                <div key={policy.id} className={`flex items-center justify-between px-6 py-4 hover:bg-[#16161f] transition-colors ${!policy.enabled ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div>
                      <p className="text-sm font-medium">{policy.name}</p>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                        policy.type === "LOSS" ? "bg-red-500/20 text-red-400" :
                        policy.type === "POSITION" ? "bg-blue-500/20 text-blue-400" :
                        policy.type === "PORTFOLIO" ? "bg-purple-500/20 text-purple-400" :
                        policy.type === "CONCENTRATION" ? "bg-orange-500/20 text-orange-400" :
                        "bg-amber-500/20 text-amber-400"
                      }`}>
                        {policy.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-sm font-mono text-zinc-300">{policy.threshold}</span>
                    <button onClick={() => togglePolicy(policy.id)}>
                      {policy.enabled ? (
                        <ToggleRight className="h-6 w-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-600" />
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <button className="text-zinc-600 hover:text-blue-400 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="text-zinc-600 hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div>
            <div className="p-6 border-b border-[#1e1e2e]">
              <h2 className="text-sm font-semibold">Audit Log</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Recent workspace activity</p>
            </div>
            <div className="p-6">
              <div className="relative">
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[#1e1e2e]" />
                <div className="space-y-6">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="relative flex items-start gap-4 pl-10">
                      <div className="absolute left-[14px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#111118] bg-[#2a2a3a] z-10" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-white">{entry.action}</span>
                          <span className="text-xs text-zinc-600">&middot;</span>
                          <span className="text-xs text-zinc-500">{entry.target}</span>
                        </div>
                        {entry.detail && (
                          <p className="text-xs text-zinc-500 mb-1">{entry.detail}</p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                          <span className="flex items-center gap-1">
                            {entry.actorType === "human" ? <User className="h-3 w-3" /> : entry.actorType === "agent" ? <Bot className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                            {entry.actor}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
