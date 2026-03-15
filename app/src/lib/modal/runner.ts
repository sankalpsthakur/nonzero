// ---------------------------------------------------------------------------
// Modal Sandbox Runner — High-level Orchestration
// ---------------------------------------------------------------------------
// This module is the main entry point for launching research, India equity,
// and autoresearch runs inside Modal Sandboxes. Each launch function follows
// the same lifecycle:
//
//   1. Create a run record in the control plane
//   2. Reserve credits for the maximum sandbox duration
//   3. Create a Modal Sandbox with proper naming, tags, and image
//   4. Start heartbeat monitoring
//   5. Poll for completion
//   6. Collect artifacts and metrics
//   7. Settle credits (debit actual usage, release remainder)
//
// All functions are idempotent with respect to the run ID + attempt number.
// ---------------------------------------------------------------------------

import type {
  SandboxConfig,
  SandboxInfo,
  SandboxTags,
  ResearchRunParams,
  IndiaRunParams,
  AutoresearchParams,
  RunResult,
  RunMetrics,
  Artifact,
  ExecResult,
} from "./types";
import { ControlPlaneError, ModalApiError } from "./types";
import {
  createSandbox,
  getSandbox,
  terminateSandbox,
  getSandboxLogs,
  execInSandbox,
} from "./client";
import {
  getResearchImage,
  getEvaluationImage,
  getAutoresearchImage,
} from "./sandbox-image";
import { SandboxEventEmitter } from "./events";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Base URL for the nonzero control plane API.
 */
const CONTROL_PLANE_BASE =
  process.env.CONTROL_PLANE_API_URL || (() => { throw new Error("CONTROL_PLANE_API_URL env var is required"); })();

/** Default sandbox timeout: 30 minutes. */
const DEFAULT_TIMEOUT_SECONDS = 30 * 60;

/** Polling interval for sandbox status checks (10 seconds). */
const POLL_INTERVAL_MS = 10_000;

/** Maximum time to wait for a sandbox to finish before giving up (2 hours). */
const MAX_POLL_DURATION_MS = 2 * 60 * 60 * 1000;

/** Default CPU allocation per sandbox. */
const DEFAULT_CPU = 2;

/** Default memory allocation per sandbox (MiB). */
const DEFAULT_MEMORY_MIB = 4096;

// ---------------------------------------------------------------------------
// Control plane helpers
// ---------------------------------------------------------------------------

/**
 * Posts a JSON payload to the control plane API.
 */
async function controlPlanePost<T>(
  path: string,
  payload: unknown,
  label: string,
): Promise<T> {
  const url = `${CONTROL_PLANE_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ControlPlaneError(
      `Control plane [${label}]: ${res.status} – ${body}`,
      res.status,
      path,
    );
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

/**
 * Sends a PATCH to the control plane API.
 */
async function controlPlanePatch<T>(
  path: string,
  payload: unknown,
  label: string,
): Promise<T> {
  const url = `${CONTROL_PLANE_BASE}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ControlPlaneError(
      `Control plane [${label}]: ${res.status} – ${body}`,
      res.status,
      path,
    );
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Sandbox naming & tags
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic sandbox name: `run-<runId>-<attemptNumber>`.
 */
function buildSandboxName(runId: string, attemptNumber: number): string {
  return `run-${runId}-${attemptNumber}`;
}

/**
 * Builds the standard tag set for a sandbox.
 */
function buildTags(params: {
  workspaceSlug: string;
  env: "research" | "paper" | "shadow-live" | "live";
  swarmId?: string;
  familySlug: string;
  agentId?: string;
}): SandboxTags {
  return {
    project: "nonzero",
    workspace: params.workspaceSlug,
    env: params.env,
    ...(params.swarmId && { swarm: params.swarmId }),
    family: params.familySlug,
    ...(params.agentId && { agent: params.agentId }),
  };
}

// ---------------------------------------------------------------------------
// Credit management
// ---------------------------------------------------------------------------

interface CreditReservation {
  reservationId: string;
  accountId: string;
  amount: number;
}

/**
 * Reserves credits for a run. The reservation locks the specified number
 * of sandbox-seconds worth of credits. If the account has insufficient
 * balance, this will throw.
 */
async function reserveCredits(
  creditAccountId: string,
  maxSeconds: number,
  runId: string,
): Promise<CreditReservation> {
  return controlPlanePost<CreditReservation>(
    "/credits/reserve",
    {
      accountId: creditAccountId,
      amount: maxSeconds,
      runId,
      description: `Sandbox credit reservation for run ${runId}`,
    },
    "reserveCredits",
  );
}

/**
 * Settles a credit reservation: debits the actual usage and releases
 * the remainder back to the account balance.
 */
async function settleCredits(
  reservationId: string,
  actualSeconds: number,
): Promise<void> {
  await controlPlanePost(
    "/credits/settle",
    {
      reservationId,
      actualAmount: actualSeconds,
    },
    "settleCredits",
  );
}

// ---------------------------------------------------------------------------
// Run record management
// ---------------------------------------------------------------------------

interface RunRecord {
  id: string;
  status: string;
}

/**
 * Creates or retrieves a run attempt record in the control plane.
 */
async function createRunAttempt(
  runId: string,
  attemptNumber: number,
  sandboxName: string,
): Promise<void> {
  await controlPlanePost(
    `/runs/${encodeURIComponent(runId)}/attempts`,
    {
      attemptNumber,
      sandboxName,
      status: "running",
      startedAt: new Date().toISOString(),
    },
    "createRunAttempt",
  );
}

/**
 * Updates the run record status in the control plane.
 */
async function updateRunStatus(
  runId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await controlPlanePatch(
    `/runs/${encodeURIComponent(runId)}`,
    { status, ...extra },
    "updateRunStatus",
  );
}

/**
 * Updates the run attempt record with completion information.
 */
async function completeRunAttempt(
  runId: string,
  attemptNumber: number,
  status: string,
  exitCode?: number,
): Promise<void> {
  await controlPlanePatch(
    `/runs/${encodeURIComponent(runId)}/attempts/${attemptNumber}`,
    {
      status,
      exitCode,
      completedAt: new Date().toISOString(),
    },
    "completeRunAttempt",
  );
}

// ---------------------------------------------------------------------------
// Sandbox polling
// ---------------------------------------------------------------------------

/**
 * Polls a sandbox until it reaches a terminal state (completed, failed,
 * terminated, timeout) or the maximum poll duration is exceeded.
 *
 * @returns The final SandboxInfo.
 */
async function waitForCompletion(sandboxId: string): Promise<SandboxInfo> {
  const deadline = Date.now() + MAX_POLL_DURATION_MS;

  while (Date.now() < deadline) {
    const info = await getSandbox(sandboxId);

    if (
      info.status === "completed" ||
      info.status === "failed" ||
      info.status === "terminated" ||
      info.status === "timeout"
    ) {
      return info;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Timed out waiting — attempt to terminate and return timeout status
  try {
    await terminateSandbox(sandboxId);
  } catch {
    // Best-effort termination
  }

  return {
    sandboxId,
    name: "",
    status: "timeout",
    tags: {},
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Artifact collection
// ---------------------------------------------------------------------------

/** Well-known artifact paths for research runs. */
const RESEARCH_ARTIFACT_PATHS = [
  { path: "/root/.hyperspace/autoquant/autoquant-state.json", name: "autoquant-state.json", type: "REPORT" as const },
  { path: "/app/results.tsv", name: "results.tsv", type: "REPORT" as const },
  { path: "/app/equity_curve.json", name: "equity_curve.json", type: "EQUITY_CURVE" as const },
];

/** Well-known artifact paths for India evaluation runs. */
const INDIA_ARTIFACT_PATHS = [
  { path: "/app/india_results.tsv", name: "india_results.tsv", type: "REPORT" as const },
  { path: "/app/india_equity_curves.json", name: "india_equity_curves.json", type: "EQUITY_CURVE" as const },
];

/** Well-known artifact paths for autoresearch runs. */
const AUTORESEARCH_ARTIFACT_PATHS = [
  { path: "/app/autoresearch/results.tsv", name: "autoresearch_results.tsv", type: "REPORT" as const },
  { path: "/app/autoresearch/best_model.pt", name: "best_model.pt", type: "CODE_SNAPSHOT" as const },
  { path: "/app/autoresearch/experiment_log.json", name: "experiment_log.json", type: "REPORT" as const },
];

/**
 * Collects artifacts from a sandbox by reading known artifact paths and
 * uploading them to the control plane's artifact storage.
 *
 * Uses `execInSandbox` to check for file existence and read contents.
 * Artifacts that don't exist are silently skipped.
 *
 * @param sandboxId - The Modal sandbox to collect from.
 * @param runId - The run ID for artifact registration.
 * @param artifactPaths - List of paths to check inside the sandbox.
 * @returns Array of successfully collected artifacts.
 */
export async function collectArtifacts(
  sandboxId: string,
  runId: string,
  artifactPaths: Array<{ path: string; name: string; type: Artifact["type"] }> = RESEARCH_ARTIFACT_PATHS,
): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  for (const { path, name, type } of artifactPaths) {
    try {
      // Check if the file exists
      const checkResult = await execInSandbox(sandboxId, [
        "test", "-f", path, "&&", "wc", "-c", "<", path,
      ]);

      if (checkResult.exitCode !== 0) {
        continue; // File does not exist, skip
      }

      const sizeBytes = parseInt(checkResult.stdout.trim(), 10) || undefined;

      // Read the file content and upload to control plane
      const readResult = await execInSandbox(sandboxId, [
        "cat", path,
      ]);

      if (readResult.exitCode !== 0) {
        console.error(
          `[collectArtifacts] Failed to read ${path} from sandbox ${sandboxId}: ${readResult.stderr}`,
        );
        continue;
      }

      // Upload to control plane artifact storage
      const uploaded = await controlPlanePost<{ url: string }>(
        `/runs/${encodeURIComponent(runId)}/artifacts`,
        {
          name,
          type,
          content: readResult.stdout,
          sizeBytes,
        },
        `uploadArtifact(${name})`,
      );

      artifacts.push({
        name,
        type,
        url: uploaded.url,
        sizeBytes,
      });
    } catch (err) {
      // Log but don't fail the entire collection for one artifact
      console.error(
        `[collectArtifacts] Error collecting ${name} from sandbox ${sandboxId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Metrics reporting
// ---------------------------------------------------------------------------

/**
 * Posts run metrics to the control plane API. Called after a run completes
 * to persist the final metrics (duration, sandbox-seconds, strategy-level
 * scores, etc.).
 *
 * @param runId - The run to report metrics for.
 * @param metrics - The collected metrics.
 */
export async function reportMetrics(
  runId: string,
  metrics: RunMetrics,
): Promise<void> {
  await controlPlanePost(
    `/runs/${encodeURIComponent(runId)}/metrics`,
    metrics,
    "reportMetrics",
  );
}

// ---------------------------------------------------------------------------
// Sandbox duration calculation
// ---------------------------------------------------------------------------

/**
 * Calculates sandbox-seconds from the SandboxInfo timestamps.
 * Falls back to 0 if timestamps are missing.
 */
function calculateSandboxSeconds(info: SandboxInfo): number {
  const start = info.startedAt ? new Date(info.startedAt).getTime() : 0;
  const end = info.finishedAt
    ? new Date(info.finishedAt).getTime()
    : Date.now();

  if (!start) return 0;

  return Math.max(0, Math.ceil((end - start) / 1000));
}

// ---------------------------------------------------------------------------
// Core run lifecycle
// ---------------------------------------------------------------------------

/**
 * Executes the common run lifecycle. Each specific launch function builds
 * the SandboxConfig and delegates to this function for the actual
 * orchestration.
 */
async function executeRun(
  config: SandboxConfig,
  params: {
    runId: string;
    attemptNumber: number;
    creditAccountId: string;
    maxCreditSeconds: number;
    artifactPaths: Array<{ path: string; name: string; type: Artifact["type"] }>;
  },
): Promise<RunResult> {
  const { runId, attemptNumber, creditAccountId, maxCreditSeconds, artifactPaths } = params;
  const sandboxName = config.name;

  // -----------------------------------------------------------------------
  // Step 1: Reserve credits
  // -----------------------------------------------------------------------
  let reservation: CreditReservation;
  try {
    reservation = await reserveCredits(creditAccountId, maxCreditSeconds, runId);
  } catch (err) {
    throw new ControlPlaneError(
      `Failed to reserve ${maxCreditSeconds} sandbox-seconds for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
      402,
      "/credits/reserve",
    );
  }

  // -----------------------------------------------------------------------
  // Step 2: Create run attempt record
  // -----------------------------------------------------------------------
  await createRunAttempt(runId, attemptNumber, sandboxName);
  await updateRunStatus(runId, "RUNNING", {
    sandboxName,
    startedAt: new Date().toISOString(),
  });

  // -----------------------------------------------------------------------
  // Step 3: Create Modal Sandbox
  // -----------------------------------------------------------------------
  let sandboxInfo: SandboxInfo;
  try {
    sandboxInfo = await createSandbox(config);
  } catch (err) {
    // Failed to create sandbox — release credits and mark as failed
    await settleCredits(reservation.reservationId, 0).catch(() => {});
    await updateRunStatus(runId, "FAILED", {
      completedAt: new Date().toISOString(),
    });
    await completeRunAttempt(runId, attemptNumber, "FAILED").catch(() => {});

    throw new ModalApiError(
      `Failed to create sandbox for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  // -----------------------------------------------------------------------
  // Step 4: Start heartbeat monitoring
  // -----------------------------------------------------------------------
  const eventEmitter = new SandboxEventEmitter(runId);
  eventEmitter.startHeartbeat();
  eventEmitter.emitLog("info", `Sandbox ${sandboxInfo.sandboxId} created for run ${runId} attempt ${attemptNumber}`);

  // -----------------------------------------------------------------------
  // Step 5: Wait for completion
  // -----------------------------------------------------------------------
  let finalInfo: SandboxInfo;
  try {
    finalInfo = await waitForCompletion(sandboxInfo.sandboxId);
  } catch (err) {
    // Polling failed — attempt to terminate and clean up
    eventEmitter.emitError(
      `Polling failed for sandbox ${sandboxInfo.sandboxId}: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );

    try {
      await terminateSandbox(sandboxInfo.sandboxId);
    } catch {
      // Best-effort termination
    }

    finalInfo = {
      ...sandboxInfo,
      status: "failed",
      finishedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Step 6: Collect artifacts (only if sandbox completed)
  // -----------------------------------------------------------------------
  let artifacts: Artifact[] = [];
  if (finalInfo.status === "completed") {
    try {
      artifacts = await collectArtifacts(
        sandboxInfo.sandboxId,
        runId,
        artifactPaths,
      );
      for (const artifact of artifacts) {
        eventEmitter.emitArtifact(artifact.name, artifact.url, artifact.type);
      }
    } catch (err) {
      eventEmitter.emitError(
        `Artifact collection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Step 7: Calculate metrics and settle credits
  // -----------------------------------------------------------------------
  const sandboxSeconds = calculateSandboxSeconds(finalInfo);
  const durationSeconds = sandboxSeconds;

  const metrics: RunMetrics = {
    durationSeconds,
    sandboxSeconds,
    exitCode: finalInfo.exitCode ?? -1,
  };

  // Report metrics
  try {
    await reportMetrics(runId, metrics);
  } catch (err) {
    console.error(
      `[executeRun] Failed to report metrics for run ${runId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Settle credits
  try {
    await settleCredits(reservation.reservationId, sandboxSeconds);
  } catch (err) {
    console.error(
      `[executeRun] Failed to settle credits for run ${runId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // -----------------------------------------------------------------------
  // Step 8: Update run record and clean up
  // -----------------------------------------------------------------------
  const finalStatus = finalInfo.status === "completed"
    ? "COMPLETED"
    : finalInfo.status === "timeout"
      ? "STOPPED"
      : "FAILED";

  await updateRunStatus(runId, finalStatus, {
    completedAt: new Date().toISOString(),
    metrics,
  }).catch(() => {});

  await completeRunAttempt(
    runId,
    attemptNumber,
    finalStatus,
    finalInfo.exitCode,
  ).catch(() => {});

  // Shutdown event emitter
  eventEmitter.emitLog("info", `Run ${runId} finished with status ${finalInfo.status}`);
  await eventEmitter.shutdown();

  return {
    runId,
    attemptNumber,
    sandboxId: sandboxInfo.sandboxId,
    status: finalInfo.status as RunResult["status"],
    exitCode: finalInfo.exitCode,
    metrics,
    artifacts,
    creditReservationId: reservation.reservationId,
    sandboxSecondsUsed: sandboxSeconds,
  };
}

// ---------------------------------------------------------------------------
// Public API: launchResearchRun
// ---------------------------------------------------------------------------

/**
 * Launches a hyperspace autoquant research run inside a Modal Sandbox.
 *
 * This runs `hyperspace autoquant run -n <iterations> -v` inside a sandbox
 * with the research image, then collects `autoquant-state.json` and
 * `results.tsv` as artifacts.
 *
 * @param params - Research run parameters including iterations and extra flags.
 * @returns RunResult with final status, metrics, and collected artifacts.
 *
 * @example
 * ```ts
 * const result = await launchResearchRun({
 *   runId: "run_abc123",
 *   attemptNumber: 1,
 *   workspaceSlug: "my-workspace",
 *   experimentId: "exp_xyz",
 *   familySlug: "momentum-v2",
 *   env: "research",
 *   creditAccountId: "ca_abc",
 *   maxCreditSeconds: 1800,
 *   iterations: 5,
 * });
 * ```
 */
export async function launchResearchRun(
  params: ResearchRunParams,
): Promise<RunResult> {
  const iterations = params.iterations ?? 1;
  const extraFlags = params.extraFlags ?? [];

  const command = [
    "hyperspace", "autoquant", "run",
    "-n", String(iterations),
    "-v",
    ...extraFlags,
  ];

  const config: SandboxConfig = {
    name: buildSandboxName(params.runId, params.attemptNumber),
    tags: buildTags({
      workspaceSlug: params.workspaceSlug,
      env: params.env,
      swarmId: params.swarmId,
      familySlug: params.familySlug,
      agentId: params.agentId,
    }),
    image: getResearchImage(),
    command,
    timeoutSeconds: params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    envVars: {
      ...params.envVars,
      NONZERO_RUN_ID: params.runId,
      NONZERO_EXPERIMENT_ID: params.experimentId,
      NONZERO_WORKSPACE: params.workspaceSlug,
    },
    cpu: DEFAULT_CPU,
    memoryMiB: DEFAULT_MEMORY_MIB,
  };

  return executeRun(config, {
    runId: params.runId,
    attemptNumber: params.attemptNumber,
    creditAccountId: params.creditAccountId,
    maxCreditSeconds: params.maxCreditSeconds,
    artifactPaths: RESEARCH_ARTIFACT_PATHS,
  });
}

// ---------------------------------------------------------------------------
// Public API: launchIndiaRun
// ---------------------------------------------------------------------------

/**
 * Launches a Yahoo India equity evaluation run inside a Modal Sandbox.
 *
 * This runs the `yahoo_india_loop.py` script which evaluates 6 Indian
 * equity strategies using Yahoo Finance data against the NSE universe.
 * Strategies are scored by return, alpha, sharpe, and drawdown.
 *
 * @param params - India run parameters including optional symbol/strategy overrides.
 * @returns RunResult with final status, metrics, and collected artifacts.
 *
 * @example
 * ```ts
 * const result = await launchIndiaRun({
 *   runId: "run_india_1",
 *   attemptNumber: 1,
 *   workspaceSlug: "nse-research",
 *   experimentId: "exp_nse",
 *   familySlug: "nse-momentum",
 *   env: "research",
 *   creditAccountId: "ca_abc",
 *   maxCreditSeconds: 900,
 *   symbols: ["RELIANCE", "TCS", "INFY"],
 * });
 * ```
 */
export async function launchIndiaRun(
  params: IndiaRunParams,
): Promise<RunResult> {
  const command = ["python", "/app/yahoo_india_loop.py"];

  const envVars: Record<string, string> = {
    ...params.envVars,
    NONZERO_RUN_ID: params.runId,
    NONZERO_EXPERIMENT_ID: params.experimentId,
    NONZERO_WORKSPACE: params.workspaceSlug,
  };

  // Pass symbol and strategy overrides via environment variables
  if (params.symbols && params.symbols.length > 0) {
    envVars.INDIA_SYMBOLS = params.symbols.join(",");
  }
  if (params.strategies && params.strategies.length > 0) {
    envVars.INDIA_STRATEGIES = params.strategies.join(",");
  }

  const config: SandboxConfig = {
    name: buildSandboxName(params.runId, params.attemptNumber),
    tags: buildTags({
      workspaceSlug: params.workspaceSlug,
      env: params.env,
      swarmId: params.swarmId,
      familySlug: params.familySlug,
      agentId: params.agentId,
    }),
    image: getEvaluationImage(),
    command,
    timeoutSeconds: params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    envVars,
    cpu: DEFAULT_CPU,
    memoryMiB: DEFAULT_MEMORY_MIB,
  };

  return executeRun(config, {
    runId: params.runId,
    attemptNumber: params.attemptNumber,
    creditAccountId: params.creditAccountId,
    maxCreditSeconds: params.maxCreditSeconds,
    artifactPaths: INDIA_ARTIFACT_PATHS,
  });
}

// ---------------------------------------------------------------------------
// Public API: launchAutoresearchRun
// ---------------------------------------------------------------------------

/**
 * Launches the autonomous LLM experiment loop inside a Modal Sandbox.
 *
 * This runs the full autoresearch pipeline: an LLM agent reads `program.md`,
 * mutates `train.py`, evaluates with hyperspace, and iterates. The sandbox
 * gets the heavyweight autoresearch image with PyTorch and transformers.
 *
 * GPU is allocated for this run type by default (T4).
 *
 * @param params - Autoresearch parameters including model, iterations, and program overrides.
 * @returns RunResult with final status, metrics, and collected artifacts.
 *
 * @example
 * ```ts
 * const result = await launchAutoresearchRun({
 *   runId: "run_auto_1",
 *   attemptNumber: 1,
 *   workspaceSlug: "my-lab",
 *   experimentId: "exp_auto",
 *   familySlug: "gpt-momentum",
 *   env: "research",
 *   creditAccountId: "ca_abc",
 *   maxCreditSeconds: 3600,
 *   maxIterations: 10,
 *   model: "gpt-4o",
 * });
 * ```
 */
export async function launchAutoresearchRun(
  params: AutoresearchParams,
): Promise<RunResult> {
  const command = [
    "python", "-m", "autoresearch.main",
    "--run-id", params.runId,
  ];

  if (params.maxIterations != null) {
    command.push("--max-iterations", String(params.maxIterations));
  }

  if (params.model) {
    command.push("--model", params.model);
  }

  const envVars: Record<string, string> = {
    ...params.envVars,
    NONZERO_RUN_ID: params.runId,
    NONZERO_EXPERIMENT_ID: params.experimentId,
    NONZERO_WORKSPACE: params.workspaceSlug,
  };

  // If a program override is provided, pass it as an env var so the
  // sandbox entrypoint can write it to disk before starting.
  if (params.programOverride) {
    envVars.AUTORESEARCH_PROGRAM_OVERRIDE = params.programOverride;
  }

  const config: SandboxConfig = {
    name: buildSandboxName(params.runId, params.attemptNumber),
    tags: buildTags({
      workspaceSlug: params.workspaceSlug,
      env: params.env,
      swarmId: params.swarmId,
      familySlug: params.familySlug,
      agentId: params.agentId,
    }),
    image: getAutoresearchImage(),
    command,
    timeoutSeconds: params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    envVars,
    cpu: DEFAULT_CPU,
    memoryMiB: 8192, // Autoresearch needs more memory for LLM inference
    gpu: "T4",       // GPU for PyTorch model training / inference
  };

  return executeRun(config, {
    runId: params.runId,
    attemptNumber: params.attemptNumber,
    creditAccountId: params.creditAccountId,
    maxCreditSeconds: params.maxCreditSeconds,
    artifactPaths: AUTORESEARCH_ARTIFACT_PATHS,
  });
}
