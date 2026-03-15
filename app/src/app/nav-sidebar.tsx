"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Waypoints,
  Beaker,
  Play,
  Bot,
  Database,
  Activity,
  Landmark,
  ShieldCheck,
  Rocket,
  AlertTriangle,
  ShieldAlert,
  Users,
  Coins,
  ListChecks,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Testing",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Research Lab", href: "/research", icon: FlaskConical },
      { label: "Swarms", href: "/swarms", icon: Waypoints },
      { label: "Experiments", href: "/experiments", icon: Beaker },
      { label: "Runs", href: "/runs", icon: Play },
      { label: "Agents", href: "/agents", icon: Bot },
      { label: "Datasets", href: "/datasets", icon: Database },
    ],
  },
  {
    title: "Live",
    items: [
      { label: "Live Ops", href: "/live-ops", icon: Activity },
      { label: "Brokerage", href: "/brokerage", icon: Landmark },
      { label: "Approvals", href: "/approvals", icon: ShieldCheck },
      { label: "Deployments", href: "/deployments", icon: Rocket },
      { label: "Incidents", href: "/incidents", icon: AlertTriangle },
      { label: "Risk", href: "/risk", icon: ShieldAlert },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Members", href: "/members", icon: Users },
      { label: "Credits", href: "/credits", icon: Coins },
      { label: "Onboarding", href: "/onboarding", icon: ListChecks },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

export function NavSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[#1e1e2e] bg-[#111118] transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-[#1e1e2e] px-4">
        <Activity className="h-6 w-6 shrink-0 text-[#3b82f6]" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-wide text-white">
            nonzero
          </span>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navigation.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#71717a]">
                {section.title}
              </p>
            )}
            {collapsed && <div className="mb-1 border-t border-[#1e1e2e]" />}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-[#3b82f6]/10 text-[#3b82f6] font-medium"
                          : "text-[#a1a1aa] hover:bg-[#1e1e2e] hover:text-white",
                        collapsed && "justify-center px-0",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t border-[#1e1e2e] text-[#71717a] transition-colors hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
