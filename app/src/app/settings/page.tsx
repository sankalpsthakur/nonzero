"use client";

import { useState } from "react";
import {
  Settings, Users, Shield, Coins, Building2, FileText,
  ChevronRight, Plus, Trash2, Edit3, Save
} from "lucide-react";

type Tab = "general" | "members" | "broker" | "risk" | "credits" | "audit";

const members = [
  { id: 1, name: "Sankalp", email: "sankalp@example.com", role: "Owner", status: "active", joinedAt: "2025-11-15" },
  { id: 2, name: "Atlas (AI)", email: "atlas@agent", role: "Research Director", status: "active", joinedAt: "2025-11-15" },
  { id: 3, name: "Priya", email: "priya@example.com", role: "Analyst", status: "active", joinedAt: "2026-01-10" },
  { id: 4, name: "Rahul", email: "rahul@example.com", role: "Viewer", status: "invited", joinedAt: "2026-03-10" },
];

const riskPolicies = [
  { id: 1, name: "Max Daily Loss", value: "50,000", type: "DRAWDOWN", active: true },
  { id: 2, name: "Max Position Size", value: "10,00,000", type: "POSITION", active: true },
  { id: 3, name: "Max Portfolio Drawdown", value: "12%", type: "DRAWDOWN", active: true },
  { id: 4, name: "Max Concentration", value: "25%", type: "EXPOSURE", active: true },
  { id: 5, name: "Max Open Orders", value: "50", type: "ORDER", active: true },
  { id: 6, name: "Intraday Stop Time", value: "15:15", type: "TIME", active: true },
];

const auditLog = [
  { time: "10 min ago", user: "Sankalp", action: "Approved promotion", detail: "Momentum Alpha v3 -> Paper", ip: "192.168.1.1" },
  { time: "1 hour ago", user: "Atlas (AI)", action: "Spawned swarm", detail: "Frontier Explorer Alpha", ip: "agent" },
  { time: "2 hours ago", user: "Sankalp", action: "Modified risk policy", detail: "Max Daily Loss: 40K -> 50K", ip: "192.168.1.1" },
  { time: "3 hours ago", user: "Priya", action: "Created experiment", detail: "Gap Fill Reversal", ip: "192.168.1.15" },
  { time: "5 hours ago", user: "System", action: "Kill switch triggered", detail: "Intraday Scalper drawdown breach", ip: "system" },
  { time: "1 day ago", user: "Sankalp", action: "Connected broker", detail: "Zerodha Kite session refreshed", ip: "192.168.1.1" },
  { time: "1 day ago", user: "Atlas (AI)", action: "Rejected experiment", detail: "Event Catalyst v2 - low alpha", ip: "agent" },
  { time: "2 days ago", user: "Sankalp", action: "Invited member", detail: "rahul@example.com as Viewer", ip: "192.168.1.1" },
];

const tabs: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: "general", label: "General", icon: Settings },
  { key: "members", label: "Members", icon: Users },
  { key: "broker", label: "Broker", icon: Building2 },
  { key: "risk", label: "Risk Policies", icon: Shield },
  { key: "credits", label: "Credit Policies", icon: Coins },
  { key: "audit", label: "Audit Log", icon: FileText },
];

const roleColor: Record<string, string> = {
  Owner: "bg-purple-500/20 text-purple-400",
  "Research Director": "bg-blue-500/20 text-blue-400",
  Analyst: "bg-emerald-500/20 text-emerald-400",
  Viewer: "bg-zinc-500/20 text-zinc-400",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-400" />
          Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Workspace configuration and management</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <div className="space-y-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeTab === tab.key ? "bg-blue-500/10 text-blue-400 font-medium" : "text-zinc-400 hover:bg-[#1e1e2e]/50 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* General */}
          {activeTab === "general" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-semibold">General Settings</h2>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Workspace Name</label>
                  <input type="text" defaultValue="Alpha Trading" className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-sm text-white outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Slug</label>
                  <input type="text" defaultValue="alpha-trading" className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-sm text-white font-mono outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Workspace ID</label>
                  <p className="text-sm text-zinc-400 font-mono bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5">ws_01HXYZ1234567890</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </div>
          )}

          {/* Members */}
          {activeTab === "members" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
              <div className="p-5 border-b border-[#1e1e2e] flex items-center justify-between">
                <h2 className="text-sm font-semibold">Team Members</h2>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Invite Member
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                    <th className="text-left py-3 px-5 font-medium">Name</th>
                    <th className="text-left py-3 px-3 font-medium">Email</th>
                    <th className="text-center py-3 px-3 font-medium">Role</th>
                    <th className="text-center py-3 px-3 font-medium">Status</th>
                    <th className="text-right py-3 px-5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                      <td className="py-3 px-5 font-medium">{m.name}</td>
                      <td className="py-3 px-3 text-zinc-400 text-xs">{m.email}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColor[m.role]}`}>{m.role}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          m.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                        }`}>{m.status}</span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1.5 rounded hover:bg-[#1e1e2e] text-zinc-500 hover:text-zinc-300 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {m.role !== "Owner" && (
                            <button className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Broker */}
          {activeTab === "broker" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-semibold">Broker Configuration</h2>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Kite Connect API Key</label>
                  <input type="text" defaultValue="xxxx••••••••" className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-sm text-zinc-400 font-mono outline-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Kite Connect API Secret</label>
                  <input type="password" defaultValue="secretkey" className="w-full px-3 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-sm text-zinc-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Redirect URL</label>
                  <p className="text-sm text-zinc-400 font-mono bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5">https://yourapp.com/api/brokers/zerodha/callback</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Postback URL</label>
                  <p className="text-sm text-zinc-400 font-mono bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5">https://yourapp.com/api/brokers/zerodha/postback</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          )}

          {/* Risk Policies */}
          {activeTab === "risk" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Risk Policies</h2>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Policy
                </button>
              </div>
              <div className="space-y-2">
                {riskPolicies.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 border border-[#1e1e2e] rounded-lg hover:border-[#2a2a3a] transition-colors">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Type: {p.type}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-zinc-300">{p.value}</span>
                      <button className="p-1.5 rounded hover:bg-[#1e1e2e] text-zinc-500 hover:text-zinc-300 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit Policies */}
          {activeTab === "credits" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-semibold">Credit Policies</h2>
              <div className="space-y-4 max-w-lg">
                {[
                  { label: "Max single-run cost", value: "2,000" },
                  { label: "Max swarm reservation", value: "10,000" },
                  { label: "Daily spend limit", value: "5,000" },
                  { label: "Low balance alert", value: "5,000" },
                ].map((p) => (
                  <div key={p.label} className="flex items-center justify-between p-3 border border-[#1e1e2e] rounded-lg">
                    <span className="text-sm text-zinc-300">{p.label}</span>
                    <input type="text" defaultValue={p.value} className="w-32 px-3 py-1.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-sm text-white font-mono text-right outline-none focus:border-blue-500/50" />
                  </div>
                ))}
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          )}

          {/* Audit Log */}
          {activeTab === "audit" && (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
              <div className="p-5 border-b border-[#1e1e2e]">
                <h2 className="text-sm font-semibold">Audit Log</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-xs text-zinc-500">
                    <th className="text-left py-3 px-5 font-medium">Time</th>
                    <th className="text-left py-3 px-3 font-medium">User</th>
                    <th className="text-left py-3 px-3 font-medium">Action</th>
                    <th className="text-left py-3 px-3 font-medium">Detail</th>
                    <th className="text-right py-3 px-5 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors">
                      <td className="py-3 px-5 text-xs text-zinc-500">{entry.time}</td>
                      <td className="py-3 px-3 font-medium text-xs">{entry.user}</td>
                      <td className="py-3 px-3 text-xs text-zinc-400">{entry.action}</td>
                      <td className="py-3 px-3 text-xs text-zinc-500">{entry.detail}</td>
                      <td className="py-3 px-5 text-right text-xs text-zinc-600 font-mono">{entry.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
