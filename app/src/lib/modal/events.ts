// ---------------------------------------------------------------------------
// Modal Sandbox Event Bridge
// ---------------------------------------------------------------------------
// Event bridge between Modal Sandboxes and the nonzero control plane.
// Sandboxes emit structured events (heartbeats, metrics, logs, artifacts,
// errors) which are forwarded to the control plane API for persistence
// and real-time monitoring.
// ---------------------------------------------------------------------------

import type { SandboxEvent, SandboxEventType } from "./types";
import { ControlPlaneError } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Base URL for the nonzero control plane API.
 * Falls back to localhost for development.
 */
const CONTROL_PLANE_BASE =
  process.env.CONTROL_PLANE_API_URL ?? "http://localhost:3000/api";

/** Default heartbeat interval: 30 seconds. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/** Maximum events to batch before flushing. */
const MAX_BATCH_SIZE = 50;

/** Maximum time to hold events before flushing (5 seconds). */
const MAX_BATCH_DELAY_MS = 5_000;

/** HTTP request timeout for event delivery (10 seconds). */
const EVENT_DELIVERY_TIMEOUT_MS = 10_000;

/** Maximum retries for failed event delivery. */
const MAX_DELIVERY_RETRIES = 3;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Posts a payload to the control plane API with timeout and retries.
 */
async function postToControlPlane<T>(
  path: string,
  payload: unknown,
  label: string,
): Promise<T> {
  const url = `${CONTROL_PLANE_BASE}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_DELIVERY_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      EVENT_DELIVERY_TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        if ((res.status === 429 || res.status >= 500) && attempt < MAX_DELIVERY_RETRIES - 1) {
          lastError = new ControlPlaneError(
            `Control plane [${label}]: ${res.status}`,
            res.status,
            path,
          );
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }

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
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof ControlPlaneError) {
        throw err;
      }

      if (attempt < MAX_DELIVERY_RETRIES - 1) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }

      throw new ControlPlaneError(
        `Control plane [${label}]: network error – ${err instanceof Error ? err.message : String(err)}`,
        0,
        path,
      );
    }
  }

  throw lastError ?? new ControlPlaneError(`Control plane [${label}]: exhausted retries`, 0, path);
}

// ---------------------------------------------------------------------------
// SandboxEventEmitter
// ---------------------------------------------------------------------------

/**
 * Event emitter that sandboxes use to report structured events back to the
 * nonzero control plane. Supports batching, automatic heartbeats, and
 * graceful flushing on shutdown.
 *
 * @example
 * ```ts
 * const emitter = new SandboxEventEmitter(runId);
 * emitter.startHeartbeat();
 *
 * emitter.emitMetric("sharpe", 1.42);
 * emitter.emitLog("info", "Iteration 5 complete");
 * emitter.emitArtifact("results.tsv", "https://...", "REPORT");
 *
 * // On completion:
 * await emitter.flush();
 * emitter.stopHeartbeat();
 * ```
 */
export class SandboxEventEmitter {
  private readonly runId: string;
  private batch: SandboxEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private isShutdown = false;

  constructor(runId: string) {
    this.runId = runId;
  }

  // -------------------------------------------------------------------------
  // Event builders
  // -------------------------------------------------------------------------

  /**
   * Queues a heartbeat event. Heartbeats signal to the control plane that
   * the sandbox is still alive and processing.
   */
  emitHeartbeat(): void {
    this.enqueue("heartbeat", {});
  }

  /**
   * Queues a metric event. Metrics are numeric key-value pairs that track
   * strategy performance (return, sharpe, alpha, etc.) or operational
   * measurements (iterations completed, sandbox seconds).
   *
   * @param key - Metric name (e.g. "sharpe", "total_return", "iteration").
   * @param value - Numeric metric value.
   */
  emitMetric(key: string, value: number): void {
    this.enqueue("metric", { key, value });
  }

  /**
   * Queues a log event. Logs are forwarded to the control plane for
   * real-time display in the run detail view.
   *
   * @param level - Log level: "debug", "info", "warn", "error".
   * @param message - The log message.
   */
  emitLog(level: string, message: string): void {
    this.enqueue("log", { level, message });
  }

  /**
   * Queues an artifact registration event. Called after an artifact (TSV,
   * JSON, equity curve, etc.) has been uploaded to object storage.
   *
   * @param name - Artifact filename (e.g. "results.tsv").
   * @param url - URL where the artifact was uploaded (S3/R2).
   * @param type - Artifact type matching RunArtifactType in the schema.
   */
  emitArtifact(name: string, url: string, type: string): void {
    this.enqueue("artifact", { name, url, type });
  }

  /**
   * Queues an error event. Errors are surfaced prominently in the control
   * plane UI and may trigger automatic sandbox termination depending on
   * severity.
   *
   * @param error - Error message or description.
   * @param fatal - If true, indicates the sandbox cannot continue.
   */
  emitError(error: string, fatal = false): void {
    this.enqueue("error", { error, fatal });
  }

  /**
   * Queues a status change event. Used to notify the control plane of
   * sandbox lifecycle transitions (e.g. "running" -> "completed").
   *
   * @param from - Previous status.
   * @param to - New status.
   */
  emitStatusChange(from: string, to: string): void {
    this.enqueue("status_change", { from, to });
  }

  // -------------------------------------------------------------------------
  // Heartbeat management
  // -------------------------------------------------------------------------

  /**
   * Starts a periodic heartbeat that fires every `intervalMs` milliseconds.
   * The heartbeat is automatically stopped on `shutdown()`.
   *
   * @param intervalMs - Heartbeat interval (default: 30 seconds).
   */
  startHeartbeat(intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS): void {
    if (this.heartbeatTimer) {
      return; // Already running
    }

    // Emit an initial heartbeat immediately
    this.emitHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this.isShutdown) {
        this.emitHeartbeat();
      }
    }, intervalMs);
  }

  /**
   * Stops the periodic heartbeat.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Batch management
  // -------------------------------------------------------------------------

  /**
   * Enqueues a single event into the batch. Triggers an auto-flush if
   * the batch reaches MAX_BATCH_SIZE or schedules a delayed flush.
   */
  private enqueue(type: SandboxEventType, payload: Record<string, unknown>): void {
    if (this.isShutdown) {
      return;
    }

    const event: SandboxEvent = {
      runId: this.runId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.batch.push(event);

    if (this.batch.length >= MAX_BATCH_SIZE) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, MAX_BATCH_DELAY_MS);
    }
  }

  /**
   * Immediately flushes all queued events to the control plane API.
   * Safe to call multiple times; concurrent flushes are serialised.
   *
   * @returns The number of events that were flushed.
   */
  async flush(): Promise<number> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.batch.length === 0 || this.isFlushing) {
      return 0;
    }

    this.isFlushing = true;

    // Grab the current batch and clear it
    const events = [...this.batch];
    this.batch = [];

    try {
      await postToControlPlane(
        `/runs/${encodeURIComponent(this.runId)}/events`,
        { events },
        `flush(${events.length} events)`,
      );
      return events.length;
    } catch (err) {
      // Put failed events back at the front of the batch for retry
      this.batch = [...events, ...this.batch];

      // Log but don't throw — callers should not have to handle flush failures
      // in the hot path. Events will be retried on the next flush.
      console.error(
        `[SandboxEventEmitter] Failed to flush ${events.length} events for run ${this.runId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return 0;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Gracefully shuts down the emitter: stops heartbeat, flushes remaining
   * events, and prevents further event enqueuing.
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this.stopHeartbeat();
    await this.flush();
  }

  /**
   * Returns the number of events currently queued (not yet flushed).
   */
  get pendingCount(): number {
    return this.batch.length;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory functions
// ---------------------------------------------------------------------------

/**
 * Creates a heartbeat function bound to a specific run. Returns a cleanup
 * function that stops the heartbeat when called.
 *
 * This is a simpler alternative to the full SandboxEventEmitter when only
 * heartbeating is needed (e.g. for monitoring from the control plane side).
 *
 * @param runId - The run to send heartbeats for.
 * @param intervalMs - Heartbeat interval (default: 30 seconds).
 * @returns A cleanup function that stops the heartbeat.
 */
export function createHeartbeat(
  runId: string,
  intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
): () => void {
  const emitter = new SandboxEventEmitter(runId);
  emitter.startHeartbeat(intervalMs);

  return () => {
    void emitter.shutdown();
  };
}

/**
 * Emits a single metric event to the control plane. Fire-and-forget.
 *
 * @param runId - The run to report the metric for.
 * @param key - Metric name.
 * @param value - Metric value.
 */
export async function emitMetric(
  runId: string,
  key: string,
  value: number,
): Promise<void> {
  await postToControlPlane(
    `/runs/${encodeURIComponent(runId)}/events`,
    {
      events: [
        {
          runId,
          type: "metric" as const,
          timestamp: new Date().toISOString(),
          payload: { key, value },
        },
      ],
    },
    `emitMetric(${key})`,
  );
}

/**
 * Emits a single log event to the control plane. Fire-and-forget.
 *
 * @param runId - The run to report the log for.
 * @param level - Log level.
 * @param message - Log message.
 */
export async function emitLog(
  runId: string,
  level: string,
  message: string,
): Promise<void> {
  await postToControlPlane(
    `/runs/${encodeURIComponent(runId)}/events`,
    {
      events: [
        {
          runId,
          type: "log" as const,
          timestamp: new Date().toISOString(),
          payload: { level, message },
        },
      ],
    },
    `emitLog(${level})`,
  );
}

/**
 * Emits a single artifact registration event to the control plane.
 *
 * @param runId - The run to register the artifact for.
 * @param name - Artifact filename.
 * @param url - Artifact URL.
 * @param type - Artifact type.
 */
export async function emitArtifact(
  runId: string,
  name: string,
  url: string,
  type: string,
): Promise<void> {
  await postToControlPlane(
    `/runs/${encodeURIComponent(runId)}/events`,
    {
      events: [
        {
          runId,
          type: "artifact" as const,
          timestamp: new Date().toISOString(),
          payload: { name, url, type },
        },
      ],
    },
    `emitArtifact(${name})`,
  );
}

/**
 * Emits a single error event to the control plane.
 *
 * @param runId - The run to report the error for.
 * @param error - Error description.
 */
export async function emitError(runId: string, error: string): Promise<void> {
  await postToControlPlane(
    `/runs/${encodeURIComponent(runId)}/events`,
    {
      events: [
        {
          runId,
          type: "error" as const,
          timestamp: new Date().toISOString(),
          payload: { error, fatal: false },
        },
      ],
    },
    "emitError",
  );
}
