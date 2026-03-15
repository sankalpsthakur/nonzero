import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status classification for a sandbox's heartbeat health. */
export type HeartbeatStatus = "healthy" | "stale" | "dead";

/** Per-sandbox heartbeat check result. */
export interface SandboxHeartbeat {
  runId: string;
  sandboxId: string | null;
  sandboxName: string | null;
  workspaceId: string;
  status: HeartbeatStatus;
  lastHeartbeatAt: Date | null;
  silenceMinutes: number;
  autoTerminated: boolean;
  incidentCreated: boolean;
}

/** Aggregate report from the heartbeat monitor run. */
export interface HeartbeatReport {
  sandboxes: SandboxHeartbeat[];
  total: number;
  healthy: number;
  stale: number;
  dead: number;
  autoTerminated: number;
  incidentsCreated: number;
  checkedAt: Date;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes of silence before a sandbox is flagged as stale. */
const STALE_THRESHOLD_MINUTES = 5;

/** Minutes of silence before a sandbox is auto-terminated. */
const DEAD_THRESHOLD_MINUTES = 15;

// ---------------------------------------------------------------------------
// Stub: Modal client
// ---------------------------------------------------------------------------

/**
 * Terminates a sandbox via the Modal API.
 */
async function modalTerminateSandbox(sandboxId: string): Promise<void> {
  // TODO: replace with actual Modal SDK call
  void sandboxId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sandbox heartbeat monitor.
 *
 * Checks all runs in RUNNING status for their most recent HEARTBEAT event.
 *
 *  - If the last heartbeat is >5 minutes old, the sandbox is flagged as
 *    **stale** (warning).
 *  - If the last heartbeat is >15 minutes old, the sandbox is
 *    **auto-terminated** via the Modal API and an Incident is created.
 *  - If a sandbox has no heartbeat events at all but has been running for
 *    more than 5 minutes, it is treated as stale.
 *
 * This job should run every 2-5 minutes.
 *
 * @returns A report summarizing the health of all active sandboxes.
 */
export async function checkHeartbeats(): Promise<HeartbeatReport> {
  const startTime = Date.now();
  const checkedAt = new Date();

  // Fetch all RUNNING runs that have a sandboxId
  const activeRuns = await db.run.findMany({
    where: {
      status: "RUNNING",
      sandboxId: { not: null },
    },
    select: {
      id: true,
      sandboxId: true,
      sandboxName: true,
      workspaceId: true,
      startedAt: true,
    },
  });

  const results: SandboxHeartbeat[] = [];
  let autoTerminated = 0;
  let incidentsCreated = 0;

  for (const run of activeRuns) {
    // Find the most recent heartbeat event for this run
    const lastHeartbeat = await db.runEvent.findFirst({
      where: {
        runId: run.id,
        type: "HEARTBEAT",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    // Determine silence duration
    const referenceTime = lastHeartbeat?.createdAt ?? run.startedAt ?? run.id;
    const lastBeatTime =
      lastHeartbeat?.createdAt ??
      run.startedAt ??
      checkedAt;
    const silenceMs = checkedAt.getTime() - new Date(lastBeatTime).getTime();
    const silenceMinutes = Math.floor(silenceMs / (60 * 1000));

    // Classify status
    let status: HeartbeatStatus = "healthy";
    if (silenceMinutes >= DEAD_THRESHOLD_MINUTES) {
      status = "dead";
    } else if (silenceMinutes >= STALE_THRESHOLD_MINUTES) {
      status = "stale";
    }

    let didTerminate = false;
    let didCreateIncident = false;

    // Auto-terminate dead sandboxes
    if (status === "dead" && run.sandboxId) {
      try {
        await modalTerminateSandbox(run.sandboxId);

        // Update run status
        await db.$transaction(async (tx) => {
          await tx.run.update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              completedAt: checkedAt,
            },
          });

          await tx.runAttempt.updateMany({
            where: {
              runId: run.id,
              status: { in: ["PENDING", "RUNNING"] },
            },
            data: {
              status: "FAILED",
              completedAt: checkedAt,
            },
          });

          await tx.runEvent.create({
            data: {
              runId: run.id,
              type: "ERROR",
              payload: {
                action: "heartbeat_auto_terminate",
                silenceMinutes,
                lastHeartbeatAt: lastHeartbeat?.createdAt?.toISOString() ?? null,
              },
            },
          });
        });

        didTerminate = true;
        autoTerminated++;
      } catch (err) {
        console.error(
          `[heartbeat-monitor] Failed to terminate sandbox ${run.sandboxId}:`,
          err,
        );
      }

      // Create incident for unexpected death
      await db.incident.create({
        data: {
          workspaceId: run.workspaceId,
          type: "SYSTEM_ERROR",
          status: "OPEN",
          description:
            `Sandbox ${run.sandboxName ?? run.sandboxId} (run ${run.id}) ` +
            `was auto-terminated after ${silenceMinutes} minutes of silence. ` +
            `Last heartbeat: ${lastHeartbeat?.createdAt?.toISOString() ?? "never"}.`,
        },
      });
      didCreateIncident = true;
      incidentsCreated++;
    }

    results.push({
      runId: run.id,
      sandboxId: run.sandboxId,
      sandboxName: run.sandboxName,
      workspaceId: run.workspaceId,
      status,
      lastHeartbeatAt: lastHeartbeat?.createdAt ?? null,
      silenceMinutes,
      autoTerminated: didTerminate,
      incidentCreated: didCreateIncident,
    });
  }

  const healthy = results.filter((r) => r.status === "healthy").length;
  const stale = results.filter((r) => r.status === "stale").length;
  const dead = results.filter((r) => r.status === "dead").length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[heartbeat-monitor] total=${results.length} healthy=${healthy} stale=${stale} dead=${dead} autoTerminated=${autoTerminated} incidents=${incidentsCreated} duration=${durationMs}ms`,
  );

  return {
    sandboxes: results,
    total: results.length,
    healthy,
    stale,
    dead,
    autoTerminated,
    incidentsCreated,
    checkedAt,
    durationMs,
  };
}
