"use client";

import { useState } from "react";
import "./globals.css";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavSidebar } from "./nav-sidebar";

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-20 flex h-14 items-center justify-between border-b border-[#1e1e2e] bg-[#0a0a0f]/80 px-6 backdrop-blur-sm transition-all duration-200",
        sidebarCollapsed ? "left-16" : "left-60",
      )}
    >
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-white">My Workspace</h1>
        <span className="rounded bg-[#1e1e2e] px-2 py-0.5 text-xs text-[#71717a]">
          SOLO_LAB
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#1e1e2e] bg-[#111118] px-3 py-1.5">
          <Wallet className="h-3.5 w-3.5 text-[#f59e0b]" />
          <span className="text-xs font-medium text-[#a1a1aa]">Credits:</span>
          <span className="text-xs font-semibold text-white">0.00</span>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0f] text-white antialiased">
        <NavSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
        />
        <TopBar sidebarCollapsed={collapsed} />

        <main
          className={cn(
            "pt-14 transition-all duration-200",
            collapsed ? "pl-16" : "pl-60",
          )}
        >
          <div className="p-6">{children}</div>
        </main>
      </body>
    </html>
  );
}
