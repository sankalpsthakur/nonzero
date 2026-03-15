// ---------------------------------------------------------------------------
// Modal Sandbox Runner – Type Definitions
// ---------------------------------------------------------------------------

/**
 * Tags attached to every sandbox for filtering and attribution.
 * These map directly to the labels used by the control plane for
 * cost allocation, workspace scoping, and swarm lineage tracking.
 */
export interface SandboxTags {
  /** Always "nonzero" for our platform. */
  project: "nonzero";
  /** Workspace slug that owns this sandbox. */
  workspace: string;
  /** Execution environment / lifecycle stage. */
  env: "research" | "paper" | "shadow-live" | "live";
  /** Swarm id if this sandbox belongs to a swarm run. */
  swarm?: string;
  /** Strategy family slug. */
  family?: string;
  /** Specific strategy version or identifier. */
  strategy?: string;
  /** Agent profile id that initiated the run. */
  agent?: string;
}

// ---------------------------------------------------------------------------
// Sandbox image configuration
// ---------------------------------------------------------------------------

/** A single file or directory to copy into the sandbox image. */
export interface CopyCommand {
  /** Local path (relative to repo root or absolute). */
  src: string;
  /** Destination path inside the image. */
  dst: string;
}

/** Declarative image specification consumed by `createSandbox`. */
export interface ImageConfig {
  /** Base Docker image (e.g. "python:3.10-slim"). */
  baseImage: string;
  /** Python packages to `pip install`. */
  pipPackages: string[];
  /** System packages to `apt-get install`. */
  aptPackages: string[];
  /** Files / directories to copy into the image. */
  copyCommands: CopyCommand[];
  /** Optional environment variables baked into the image. */
  envVars?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sandbox lifecycle
// ---------------------------------------------------------------------------

export type SandboxStatus =
  | "creating"
  | "running"
  | "completed"
  | "failed"
  | "terminated"
  | "timeout";

/** Configuration passed to `createSandbox`. */
export interface SandboxConfig {
  /** Human-readable name: `run-<run_id>-<attempt_id>`. */
  name: string;
  /** Tags for filtering and attribution. */
  tags: SandboxTags;
  /** Image specification. */
  image: ImageConfig;
  /** The command to execute inside the sandbox. */
  command: string[];
  /** Maximum wall-clock seconds before the sandbox is killed. */
  timeoutSeconds: number;
  /** Environment variables injected at runtime (secrets, API keys, etc.). */
  envVars?: Record<string, string>;
  /** CPU cores to allocate (Modal unit: fractional vCPU). */
  cpu?: number;
  /** Memory in MiB. */
  memoryMiB?: number;
  /** GPU type, e.g. "T4", "A10G". Omit for CPU-only. */
  gpu?: string;
}

/** Information returned by the Modal API about a sandbox. */
export interface SandboxInfo {
  /** Modal's internal sandbox identifier. */
  sandboxId: string;
  /** The name we assigned at creation time. */
  name: string;
  /** Current lifecycle status. */
  status: SandboxStatus;
  /** Tags we attached to the sandbox. */
  tags: Record<string, string>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp when the sandbox started running. */
  startedAt?: string;
  /** ISO-8601 timestamp when the sandbox finished (success or failure). */
  finishedAt?: string;
  /** Exit code of the sandbox process, if completed. */
  exitCode?: number;
}

/** Filters for `listSandboxes`. */
export interface SandboxFilters {
  /** Filter by one or more tag key-value pairs. */
  tags?: Partial<SandboxTags>;
  /** Filter by status. */
  status?: SandboxStatus;
}

// ---------------------------------------------------------------------------
// Logs & exec
// ---------------------------------------------------------------------------

/** A single log line from a sandbox. */
export interface LogEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** "stdout" | "stderr". */
  stream: "stdout" | "stderr";
  /** The log text. */
  message: string;
}

/** Result of executing a command inside a running sandbox. */
export interface ExecResult {
  /** Process exit code (0 = success). */
  exitCode: number;
  /** Combined stdout output. */
  stdout: string;
  /** Combined stderr output. */
  stderr: string;
}

// ---------------------------------------------------------------------------
// Run orchestration
// ---------------------------------------------------------------------------

/** Base parameters shared across all run types. */
interface BaseRunParams {
  /** Control-plane run record id. */
  runId: string;
  /** The attempt number for this run (supports retries). */
  attemptNumber: number;
  /** Workspace slug that owns the run. */
  workspaceSlug: string;
  /** Experiment id this run belongs to. */
  experimentId: string;
  /** Strategy family slug. */
  familySlug: string;
  /** Execution environment. */
  env: "research" | "paper" | "shadow-live" | "live";
  /** Optional swarm id. */
  swarmId?: string;
  /** Optional agent profile id. */
  agentId?: string;
  /** Credit account id for metering. */
  creditAccountId: string;
  /** Maximum sandbox-seconds to reserve. */
  maxCreditSeconds: number;
  /** Maximum wall-clock timeout in seconds. */
  timeoutSeconds?: number;
  /** Additional environment variables for the sandbox. */
  envVars?: Record<string, string>;
}

/** Parameters for launching hyperspace autoquant research. */
export interface ResearchRunParams extends BaseRunParams {
  /** Number of autoquant iterations (default: 1). */
  iterations?: number;
  /** Extra CLI flags passed to `hyperspace autoquant run`. */
  extraFlags?: string[];
}

/** Parameters for launching Yahoo India equity evaluation. */
export interface IndiaRunParams extends BaseRunParams {
  /** NSE symbols to evaluate. Omit to use the default universe. */
  symbols?: string[];
  /** Strategy names to evaluate. Omit to use all 6 defaults. */
  strategies?: string[];
}

/** Parameters for launching the autonomous LLM experiment loop. */
export interface AutoresearchParams extends BaseRunParams {
  /** Maximum number of experiment iterations. */
  maxIterations?: number;
  /** LLM model to use for code generation / mutation. */
  model?: string;
  /** Custom agent program instructions (markdown). */
  programOverride?: string;
}

/** Metrics collected from a completed run. */
export interface RunMetrics {
  /** Total wall-clock seconds the sandbox was alive. */
  durationSeconds: number;
  /** Sandbox-seconds consumed (for credit metering). */
  sandboxSeconds: number;
  /** Exit code from the sandbox. */
  exitCode: number;
  /** Strategy-level metrics (return, alpha, sharpe, drawdown, etc.). */
  strategyMetrics?: Record<string, number>;
  /** Number of iterations completed (for loop-style runs). */
  iterationsCompleted?: number;
  /** Arbitrary key-value metadata. */
  metadata?: Record<string, unknown>;
}

/** An artifact collected from a sandbox after a run completes. */
export interface Artifact {
  /** Artifact name (e.g. "results.tsv", "autoquant-state.json"). */
  name: string;
  /** The artifact type matching RunArtifactType in the schema. */
  type: "EQUITY_CURVE" | "REPORT" | "NOTEBOOK" | "PARQUET" | "CHART" | "CODE_SNAPSHOT";
  /** URL where the artifact was uploaded (e.g. S3 / R2). */
  url: string;
  /** Size in bytes, if known. */
  sizeBytes?: number;
}

/** Result returned after a run completes (success or failure). */
export interface RunResult {
  /** The run id in the control plane. */
  runId: string;
  /** The attempt number. */
  attemptNumber: number;
  /** Modal sandbox id. */
  sandboxId: string;
  /** Final status. */
  status: "completed" | "failed" | "terminated" | "timeout";
  /** Exit code. */
  exitCode?: number;
  /** Collected metrics. */
  metrics?: RunMetrics;
  /** Collected artifacts. */
  artifacts: Artifact[];
  /** Credit reservation id. */
  creditReservationId: string;
  /** Actual sandbox-seconds consumed. */
  sandboxSecondsUsed: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Event types emitted by sandboxes to the control plane. */
export type SandboxEventType =
  | "heartbeat"
  | "metric"
  | "log"
  | "artifact"
  | "error"
  | "status_change";

/** Payload shape for a sandbox event. */
export interface SandboxEvent {
  runId: string;
  type: SandboxEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API error
// ---------------------------------------------------------------------------

/** Structured error from the Modal API or control plane. */
export class ModalApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "ModalApiError";
  }
}

/** Structured error for control plane API failures. */
export class ControlPlaneError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}
