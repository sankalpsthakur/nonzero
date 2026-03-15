// ---------------------------------------------------------------------------
// Modal API Client
// ---------------------------------------------------------------------------
// Low-level client for the Modal REST API. Handles sandbox lifecycle
// operations: create, list, get, terminate, logs, and exec.
//
// Auth: uses MODAL_TOKEN_ID and MODAL_TOKEN_SECRET env vars to construct
// a Bearer token for the Modal API.
// ---------------------------------------------------------------------------

import type {
  SandboxConfig,
  SandboxInfo,
  SandboxFilters,
  SandboxStatus,
  LogEntry,
  ExecResult,
} from "./types";
import { ModalApiError } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODAL_API_BASE = "https://api.modal.com";

/** Default timeout for HTTP requests to Modal (30 seconds). */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Maximum number of retries for transient failures. */
const MAX_RETRIES = 3;

/** Base delay between retries in milliseconds (exponential backoff). */
const RETRY_BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Reads Modal credentials from environment variables. Throws if either
 * MODAL_TOKEN_ID or MODAL_TOKEN_SECRET is missing.
 */
function getCredentials(): { tokenId: string; tokenSecret: string } {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error(
      "Missing Modal credentials: both MODAL_TOKEN_ID and MODAL_TOKEN_SECRET must be set.",
    );
  }

  return { tokenId, tokenSecret };
}

/**
 * Constructs the standard headers for an authenticated Modal API request.
 */
function authHeaders(): Record<string, string> {
  const { tokenId, tokenSecret } = getCredentials();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tokenId}:${tokenSecret}`,
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether an HTTP status code is retryable (server error or
 * rate-limiting).
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Sleeps for `ms` milliseconds. Used for exponential backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core fetch wrapper with:
 *  - Bearer auth
 *  - Automatic JSON serialisation
 *  - Timeout via AbortController
 *  - Exponential backoff on transient failures
 *  - Structured ModalApiError on non-2xx responses
 */
async function modalFetch<T>(
  path: string,
  init: RequestInit & { body?: string },
  label: string,
): Promise<T> {
  const url = `${MODAL_API_BASE}${path}`;
  const headers = { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      DEFAULT_REQUEST_TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        if (isRetryable(res.status) && attempt < MAX_RETRIES - 1) {
          lastError = new ModalApiError(
            `Modal API [${label}]: ${res.status} ${res.statusText}`,
            res.status,
            body,
          );
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }

        throw new ModalApiError(
          `Modal API [${label}]: ${res.status} ${res.statusText} – ${body}`,
          res.status,
          body,
        );
      }

      // 204 No Content (e.g. terminate)
      if (res.status === 204) {
        return undefined as unknown as T;
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof ModalApiError) {
        throw err;
      }

      // Network / abort errors are retryable
      if (attempt < MAX_RETRIES - 1) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      throw new ModalApiError(
        `Modal API [${label}]: network error – ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }
  }

  // Should not reach here, but just in case:
  throw lastError ?? new ModalApiError(`Modal API [${label}]: exhausted retries`, 0);
}

// ---------------------------------------------------------------------------
// Tag serialisation
// ---------------------------------------------------------------------------

/**
 * Converts a SandboxTags / filter object into the flat key-value tags
 * structure expected by the Modal API.
 */
function serializeTags(tags: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Maps raw Modal API status strings to our canonical SandboxStatus enum.
 * The Modal API may return statuses in various formats; this normalises them.
 */
function normaliseSandboxStatus(raw: string): SandboxStatus {
  const lower = raw.toLowerCase();
  const mapping: Record<string, SandboxStatus> = {
    creating: "creating",
    running: "running",
    completed: "completed",
    terminated: "terminated",
    failed: "failed",
    timeout: "timeout",
    timed_out: "timeout",
    timedout: "timeout",
  };
  return mapping[lower] ?? "failed";
}

/**
 * Normalises a raw sandbox response from the Modal API into SandboxInfo.
 */
function toSandboxInfo(raw: Record<string, unknown>): SandboxInfo {
  return {
    sandboxId: String(raw.sandbox_id ?? raw.id ?? ""),
    name: String(raw.name ?? raw.sandbox_name ?? ""),
    status: normaliseSandboxStatus(String(raw.status ?? "failed")),
    tags: (raw.tags as Record<string, string>) ?? {},
    createdAt: String(raw.created_at ?? ""),
    startedAt: raw.started_at ? String(raw.started_at) : undefined,
    finishedAt: raw.finished_at ? String(raw.finished_at) : undefined,
    exitCode: raw.exit_code != null ? Number(raw.exit_code) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new Modal Sandbox with the given configuration.
 *
 * The sandbox is created with a deterministic name (`run-<runId>-<attemptId>`),
 * tags for workspace scoping, and the specified image / command.
 *
 * @param config - Full sandbox configuration including image, command, tags.
 * @returns SandboxInfo with the newly-created sandbox's ID and initial status.
 */
export async function createSandbox(config: SandboxConfig): Promise<SandboxInfo> {
  const payload = {
    name: config.name,
    image: {
      base_image: config.image.baseImage,
      pip_packages: config.image.pipPackages,
      apt_packages: config.image.aptPackages,
      copy_commands: config.image.copyCommands.map((c) => ({
        src: c.src,
        dst: c.dst,
      })),
      env_vars: config.image.envVars ?? {},
    },
    command: config.command,
    timeout_seconds: config.timeoutSeconds,
    tags: serializeTags(config.tags as unknown as Record<string, string | undefined>),
    env_vars: config.envVars ?? {},
    ...(config.cpu != null && { cpu: config.cpu }),
    ...(config.memoryMiB != null && { memory_mib: config.memoryMiB }),
    ...(config.gpu != null && { gpu: config.gpu }),
  };

  const raw = await modalFetch<Record<string, unknown>>(
    "/v1/sandboxes",
    { method: "POST", body: JSON.stringify(payload) },
    "createSandbox",
  );

  return toSandboxInfo(raw);
}

/**
 * Lists sandboxes matching the given tag and status filters.
 *
 * Uses the Modal API query parameters for tag-based filtering. Each tag is
 * passed as `tag_<key>=<value>`.
 *
 * @param filters - Optional tag and status filters.
 * @returns Array of matching SandboxInfo records.
 */
export async function listSandboxes(filters?: SandboxFilters): Promise<SandboxInfo[]> {
  const params = new URLSearchParams();

  if (filters?.tags) {
    const tagEntries = serializeTags(
      filters.tags as unknown as Record<string, string | undefined>,
    );
    for (const [k, v] of Object.entries(tagEntries)) {
      params.set(`tag_${k}`, v);
    }
  }

  if (filters?.status) {
    params.set("status", filters.status);
  }

  const queryString = params.toString();
  const path = queryString ? `/v1/sandboxes?${queryString}` : "/v1/sandboxes";

  const raw = await modalFetch<Record<string, unknown>[]>(
    path,
    { method: "GET" },
    "listSandboxes",
  );

  return (Array.isArray(raw) ? raw : []).map(toSandboxInfo);
}

/**
 * Retrieves the current status and metadata of a single sandbox.
 *
 * @param sandboxId - The Modal sandbox ID.
 * @returns SandboxInfo for the requested sandbox.
 * @throws ModalApiError if the sandbox is not found (404).
 */
export async function getSandbox(sandboxId: string): Promise<SandboxInfo> {
  const raw = await modalFetch<Record<string, unknown>>(
    `/v1/sandboxes/${encodeURIComponent(sandboxId)}`,
    { method: "GET" },
    "getSandbox",
  );

  return toSandboxInfo(raw);
}

/**
 * Terminates a running sandbox. This is a best-effort operation; the sandbox
 * may take a few seconds to actually stop. Safe to call on already-terminated
 * sandboxes (Modal returns 204 in both cases).
 *
 * @param sandboxId - The Modal sandbox ID to terminate.
 */
export async function terminateSandbox(sandboxId: string): Promise<void> {
  await modalFetch<void>(
    `/v1/sandboxes/${encodeURIComponent(sandboxId)}/terminate`,
    { method: "POST" },
    "terminateSandbox",
  );
}

/**
 * Retrieves log entries from a sandbox. Returns log lines as structured
 * LogEntry objects with timestamps, stream labels, and message content.
 *
 * @param sandboxId - The Modal sandbox ID.
 * @param since - Optional ISO-8601 timestamp to only return logs after this time.
 * @returns Array of log entries ordered by timestamp.
 */
export async function getSandboxLogs(
  sandboxId: string,
  since?: string,
): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (since) {
    params.set("since", since);
  }

  const queryString = params.toString();
  const path = queryString
    ? `/v1/sandboxes/${encodeURIComponent(sandboxId)}/logs?${queryString}`
    : `/v1/sandboxes/${encodeURIComponent(sandboxId)}/logs`;

  const raw = await modalFetch<Array<Record<string, unknown>>>(
    path,
    { method: "GET" },
    "getSandboxLogs",
  );

  return (Array.isArray(raw) ? raw : []).map((entry) => ({
    timestamp: String(entry.timestamp ?? new Date().toISOString()),
    stream: (entry.stream === "stderr" ? "stderr" : "stdout") as "stdout" | "stderr",
    message: String(entry.message ?? entry.text ?? entry.line ?? ""),
  }));
}

/**
 * Executes a command inside a running sandbox and waits for the result.
 *
 * This is used to run ad-hoc commands (e.g. artifact collection, health
 * checks) inside an active sandbox without restarting it.
 *
 * @param sandboxId - The Modal sandbox ID.
 * @param command - The command to execute as an array of strings.
 * @returns ExecResult with exit code, stdout, and stderr.
 * @throws ModalApiError if the sandbox is not in a running state.
 */
export async function execInSandbox(
  sandboxId: string,
  command: string[],
): Promise<ExecResult> {
  const raw = await modalFetch<Record<string, unknown>>(
    `/v1/sandboxes/${encodeURIComponent(sandboxId)}/exec`,
    {
      method: "POST",
      body: JSON.stringify({ command }),
    },
    "execInSandbox",
  );

  return {
    exitCode: Number(raw.exit_code ?? raw.exitCode ?? -1),
    stdout: String(raw.stdout ?? ""),
    stderr: String(raw.stderr ?? ""),
  };
}
