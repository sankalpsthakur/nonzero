"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  FileText,
  Plug,
  Waypoints,
  Play,
  Rocket,
  ChevronRight,
  ChevronLeft,
  Check,
  Brain,
  Shield,
  Search,
  Loader2,
  Circle,
  CheckCircle2,
  Link as LinkIcon,
  Key,
  Database,
  Gauge,
  Users,
  User,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface Step {
  id: number;
  title: string;
  description: string;
  icon: React.ElementType;
}

const steps: Step[] = [
  { id: 1, title: "Create Workspace", description: "Name and configure your workspace", icon: Building2 },
  { id: 2, title: "Research Brief", description: "Define your trading objectives", icon: FileText },
  { id: 3, title: "Infrastructure", description: "Connect APIs and services", icon: Plug },
  { id: 4, title: "Swarm Template", description: "Choose your agent swarm", icon: Waypoints },
  { id: 5, title: "Validation Run", description: "Test your configuration", icon: Play },
  { id: 6, title: "Go Live", description: "Final checklist", icon: Rocket },
];

const nseStocks = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "HINDUNILVR", "SBIN", "BHARTIARTL", "KOTAKBANK", "ITC",
  "BAJFINANCE", "LT", "AXISBANK", "ASIANPAINT", "MARUTI",
  "TATAMOTORS", "SUNPHARMA", "WIPRO", "ULTRACEMCO", "TITAN",
  "NESTLEIND", "TECHM", "HCLTECH", "POWERGRID", "NTPC",
];

const benchmarks = ["NIFTY 50", "NIFTY BANK", "NIFTY MIDCAP 100", "NIFTY IT", "NIFTY NEXT 50", "NIFTY 500"];

// ── Validation Step Progress Simulation ──────────────────

interface ValidationStep {
  label: string;
  status: "pending" | "running" | "done";
}

// ── Component ──────────────────────────────────────────────

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [workspaceName, setWorkspaceName] = useState("My Alpha Lab");
  const [workspaceType, setWorkspaceType] = useState<"solo" | "team">("solo");

  // Step 2 state
  const [objective, setObjective] = useState("Discover and deploy momentum-based equity strategies on NSE with a focus on mid-cap stocks and options hedging.");
  const [benchmark, setBenchmark] = useState("NIFTY 50");
  const [selectedStocks, setSelectedStocks] = useState<string[]>(["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "TATAMOTORS", "BAJFINANCE"]);
  const [riskAppetite, setRiskAppetite] = useState(60);

  // Step 3 state
  const [modalApiKey, setModalApiKey] = useState("sk-••••••••••••••••a7x9");
  const [kiteConnected, setKiteConnected] = useState(false);
  const [storageConfigured, setStorageConfigured] = useState(true);

  // Step 4 state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>("frontier-explorer");

  // Step 5 state
  const [validationSteps, setValidationSteps] = useState<ValidationStep[]>([
    { label: "Creating sandbox environment...", status: "pending" },
    { label: "Running sample strategy...", status: "pending" },
    { label: "Writing artifacts to storage...", status: "pending" },
    { label: "Settling credits...", status: "pending" },
    { label: "Generating validation report...", status: "pending" },
  ]);
  const [validationStarted, setValidationStarted] = useState(false);

  // Step 6 state
  const goLiveChecklist = [
    { label: "Workspace created and configured", done: true },
    { label: "Research brief defined", done: true },
    { label: "Modal API key configured", done: true },
    { label: "Kite Connect linked", done: kiteConnected },
    { label: "Swarm template selected", done: selectedTemplate !== null },
    { label: "Validation run passed", done: validationSteps.every((s) => s.status === "done") },
    { label: "Minimum credit balance (5,000)", done: true },
    { label: "Risk policies reviewed", done: false },
  ];

  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const progressPct = Math.round(((currentStep - 1) / (steps.length - 1)) * 100);

  const toggleStock = (s: string) => {
    setSelectedStocks((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const runValidation = useCallback(() => {
    setValidationStarted(true);
    setValidationSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "running" } : s)),
    );
  }, []);

  useEffect(() => {
    if (!validationStarted) return;
    const runningIdx = validationSteps.findIndex((s) => s.status === "running");
    if (runningIdx === -1) return;

    const timer = setTimeout(() => {
      setValidationSteps((prev) =>
        prev.map((s, i) => {
          if (i === runningIdx) return { ...s, status: "done" };
          if (i === runningIdx + 1) return { ...s, status: "running" };
          return s;
        }),
      );
    }, 1200 + Math.random() * 800);

    return () => clearTimeout(timer);
  }, [validationSteps, validationStarted]);

  const riskLabel =
    riskAppetite <= 25
      ? "Conservative"
      : riskAppetite <= 50
        ? "Moderate"
        : riskAppetite <= 75
          ? "Aggressive"
          : "Very Aggressive";

  const riskColor =
    riskAppetite <= 25
      ? "text-blue-400"
      : riskAppetite <= 50
        ? "text-emerald-400"
        : riskAppetite <= 75
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Rocket className="h-7 w-7 text-blue-500" />
          Onboarding
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Set up your nonzero workspace in a few steps
        </p>
      </div>

      <div className="flex gap-8">
        {/* Vertical Stepper */}
        <div className="w-64 shrink-0">
          <div className="sticky top-20">
            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                <span>Progress</span>
                <span className="font-mono">{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              {steps.map((step, idx) => {
                const isActive = currentStep === step.id;
                const isDone = currentStep > step.id;
                const Icon = step.icon;

                return (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                      isActive
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : "hover:bg-[#16161f] border border-transparent"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isDone
                          ? "bg-emerald-500/20"
                          : isActive
                            ? "bg-blue-500/20"
                            : "bg-[#1e1e2e]"
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Icon
                          className={`h-4 w-4 ${isActive ? "text-blue-400" : "text-zinc-600"}`}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-medium ${
                          isDone
                            ? "text-emerald-400"
                            : isActive
                              ? "text-white"
                              : "text-zinc-500"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-[10px] text-zinc-600 truncate">
                        {step.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">
            {/* Step 1: Create Workspace */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Create Workspace</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Your workspace is where all research, strategies, and live ops live.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="My Trading Lab"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                      Slug (auto-generated)
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5">
                      <span className="text-xs text-zinc-600">nonzero.app/</span>
                      <span className="text-sm font-mono text-blue-400">{slug}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-2 block">
                      Workspace Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setWorkspaceType("solo")}
                        className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                          workspaceType === "solo"
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-[#1e1e2e] hover:border-[#2a2a3a]"
                        }`}
                      >
                        <User className={`h-5 w-5 ${workspaceType === "solo" ? "text-blue-400" : "text-zinc-600"}`} />
                        <div className="text-left">
                          <p className="text-sm font-medium">Solo Lab</p>
                          <p className="text-xs text-zinc-500">Individual research</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setWorkspaceType("team")}
                        className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                          workspaceType === "team"
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-[#1e1e2e] hover:border-[#2a2a3a]"
                        }`}
                      >
                        <Users className={`h-5 w-5 ${workspaceType === "team" ? "text-blue-400" : "text-zinc-600"}`} />
                        <div className="text-left">
                          <p className="text-sm font-medium">Team</p>
                          <p className="text-xs text-zinc-500">Collaborative workspace</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Research Brief */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Research Brief</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Define what you want your agent swarm to discover.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                      Objective
                    </label>
                    <textarea
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none transition-colors resize-none"
                      placeholder="Describe your trading objective..."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                      Benchmark
                    </label>
                    <select
                      value={benchmark}
                      onChange={(e) => setBenchmark(e.target.value)}
                      className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
                    >
                      {benchmarks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 font-medium mb-2 block">
                      Universe ({selectedStocks.length} selected)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {nseStocks.map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleStock(s)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono transition-all ${
                            selectedStocks.includes(s)
                              ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                              : "border-[#1e1e2e] text-zinc-600 hover:border-[#2a2a3a] hover:text-zinc-400"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-zinc-400 font-medium">Risk Appetite</label>
                      <span className={`text-xs font-medium ${riskColor}`}>{riskLabel}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={riskAppetite}
                      onChange={(e) => setRiskAppetite(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                      <span>Conservative</span>
                      <span>Moderate</span>
                      <span>Aggressive</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Infrastructure */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Connect Infrastructure</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Connect the services that power your agent swarm.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Modal API Key */}
                  <div className="rounded-xl border border-[#1e1e2e] p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Key className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Modal API Key</p>
                        <p className="text-xs text-zinc-500">Serverless compute for agent execution</p>
                      </div>
                      <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        Configured
                      </span>
                    </div>
                    <input
                      type="text"
                      value={modalApiKey}
                      onChange={(e) => setModalApiKey(e.target.value)}
                      className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-4 py-2.5 text-sm font-mono text-zinc-400 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="sk-..."
                    />
                  </div>

                  {/* Kite Connect */}
                  <div className="rounded-xl border border-[#1e1e2e] p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <LinkIcon className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Kite Connect</p>
                        <p className="text-xs text-zinc-500">Zerodha brokerage integration</p>
                      </div>
                      <span
                        className={`ml-auto text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                          kiteConnected
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {kiteConnected ? "Connected" : "Not Connected"}
                      </span>
                    </div>
                    <button
                      onClick={() => setKiteConnected(true)}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                        kiteConnected
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                      }`}
                    >
                      {kiteConnected ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Connected to Zerodha
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4" />
                          Connect Kite
                        </>
                      )}
                    </button>
                  </div>

                  {/* Storage */}
                  <div className="rounded-xl border border-[#1e1e2e] p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Database className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Storage</p>
                        <p className="text-xs text-zinc-500">Artifact and backtest result storage</p>
                      </div>
                      <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        Auto-configured
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Swarm Template */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Select Swarm Template</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Choose the agent team that will execute your research brief.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {[
                    {
                      id: "frontier-explorer",
                      name: "Frontier Explorer",
                      icon: Brain,
                      color: "purple",
                      description: "Discovers novel alpha signals using LLM-driven hypothesis generation. Generates and backtests hundreds of strategy variants.",
                      agents: ["Research Director", "Strategy Generator", "Backtest Runner", "Metric Evaluator"],
                      bestFor: "New alpha discovery",
                    },
                    {
                      id: "robustness-auditor",
                      name: "Robustness Auditor",
                      icon: Shield,
                      color: "blue",
                      description: "Stress-tests existing strategies through walk-forward analysis, Monte Carlo simulation, and regime detection.",
                      agents: ["Walk-Forward Analyzer", "Monte Carlo Engine", "Regime Detector", "Report Generator"],
                      bestFor: "Strategy validation",
                    },
                    {
                      id: "divergence-investigator",
                      name: "Divergence Investigator",
                      icon: Search,
                      color: "amber",
                      description: "Monitors live vs expected performance, investigates root causes of divergence, and suggests corrective actions.",
                      agents: ["Signal Monitor", "Root Cause Analyzer", "Drift Detector", "Action Recommender"],
                      bestFor: "Live monitoring",
                    },
                  ].map((template) => {
                    const isSelected = selectedTemplate === template.id;
                    const colorMap: Record<string, { border: string; bg: string; text: string; iconBg: string }> = {
                      purple: { border: "border-purple-500/50", bg: "bg-purple-500/5", text: "text-purple-400", iconBg: "bg-purple-500/10" },
                      blue: { border: "border-blue-500/50", bg: "bg-blue-500/5", text: "text-blue-400", iconBg: "bg-blue-500/10" },
                      amber: { border: "border-amber-500/50", bg: "bg-amber-500/5", text: "text-amber-400", iconBg: "bg-amber-500/10" },
                    };
                    const c = colorMap[template.color];

                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`text-left rounded-xl border p-5 transition-all ${
                          isSelected
                            ? `${c.border} ${c.bg}`
                            : "border-[#1e1e2e] hover:border-[#2a2a3a]"
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
                            <template.icon className={`h-5 w-5 ${c.text}`} />
                          </div>
                          {isSelected && (
                            <CheckCircle2 className={`h-5 w-5 ${c.text} ml-auto`} />
                          )}
                        </div>
                        <h3 className="text-sm font-bold mb-1">{template.name}</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                          {template.description}
                        </p>
                        <div className="mb-3">
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Agents</p>
                          <div className="flex flex-wrap gap-1">
                            {template.agents.map((a) => (
                              <span
                                key={a}
                                className="text-[10px] px-2 py-0.5 rounded bg-[#1e1e2e] text-zinc-400"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-600">
                          Best for: <span className={c.text}>{template.bestFor}</span>
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 5: Validation Run */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Validation Run</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Running a sample strategy to validate your configuration.
                  </p>
                </div>

                {!validationStarted ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                      <Play className="h-8 w-8 text-blue-400" />
                    </div>
                    <p className="text-sm text-zinc-400 mb-4 text-center max-w-sm">
                      This will create a sandbox, run a sample strategy, and validate
                      that all your integrations work correctly.
                    </p>
                    <button
                      onClick={runValidation}
                      className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                    >
                      <Play className="h-4 w-4" />
                      Start Validation
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    {validationSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          {step.status === "done" ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : step.status === "running" ? (
                            <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                          ) : (
                            <Circle className="h-5 w-5 text-zinc-700" />
                          )}
                        </div>
                        <span
                          className={`text-sm ${
                            step.status === "done"
                              ? "text-emerald-400"
                              : step.status === "running"
                                ? "text-white"
                                : "text-zinc-600"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                    {validationSteps.every((s) => s.status === "done") && (
                      <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-emerald-400">Validation Passed</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            All systems operational. You can proceed to the final checklist.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Go Live Prerequisites */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Go Live Prerequisites</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Complete all items before launching your first live deployment.
                  </p>
                </div>

                <div className="space-y-2">
                  {goLiveChecklist.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                        item.done
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-[#1e1e2e]"
                      }`}
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="h-5 w-5 text-zinc-600 shrink-0" />
                      )}
                      <span
                        className={`text-sm ${item.done ? "text-emerald-400" : "text-zinc-500"}`}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <button
                    disabled={!goLiveChecklist.every((c) => c.done)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <Rocket className="h-4 w-4" />
                    Launch Live Trading
                  </button>
                  {!goLiveChecklist.every((c) => c.done) && (
                    <p className="text-xs text-zinc-600 text-center mt-2">
                      Complete all prerequisites to enable live trading
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#1e1e2e]">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              <div className="flex items-center gap-1.5">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={`w-2 h-2 rounded-full transition-all ${
                      step.id === currentStep
                        ? "bg-blue-500 w-6"
                        : step.id < currentStep
                          ? "bg-emerald-500"
                          : "bg-[#1e1e2e]"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() =>
                  setCurrentStep(Math.min(steps.length, currentStep + 1))
                }
                disabled={currentStep === steps.length}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
