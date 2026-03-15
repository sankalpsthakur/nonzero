import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncInstruments } from "@/lib/jobs/instrument-sync";
import { checkBrokerSessions } from "@/lib/jobs/session-check";
import { settleReservations } from "@/lib/jobs/credit-settlement";
import { checkHeartbeats } from "@/lib/jobs/heartbeat-monitor";
import { checkDivergence } from "@/lib/jobs/divergence-check";

type RouteParams = { params: Promise<{ name: string }> };

const VALID_JOBS = [
  "instrument-sync",
  "session-check",
  "credit-settlement",
  "heartbeat-monitor",
  "divergence-check",
] as const;

type JobName = (typeof VALID_JOBS)[number];

const bodySchema = z.object({
  /** Required workspace ID for jobs that operate per-workspace. */
  workspaceId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/jobs/[name] — Trigger a scheduled job manually
// ---------------------------------------------------------------------------

/**
 * Manually triggers one of the platform's scheduled jobs.
 *
 * This endpoint is useful for:
 *   - Testing jobs in development.
 *   - Manual intervention during incidents.
 *   - One-off runs outside the normal schedule.
 *
 * Valid job names:
 *   - `instrument-sync`     — Download Kite instrument dump and sync SymbolMaster.
 *   - `session-check`       — Check broker session health.
 *   - `credit-settlement`   — Settle completed run credit reservations.
 *   - `heartbeat-monitor`   — Check sandbox heartbeats, auto-terminate dead ones.
 *   - `divergence-check`    — Compare paper vs live execution for active deployments.
 *
 * Body (optional):
 * ```json
 * { "workspaceId": "<id>" }
 * ```
 *
 * `workspaceId` is required for `instrument-sync`; other jobs operate
 * across all workspaces by default.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate job name from the URL path
    if (!VALID_JOBS.includes(name as JobName)) {
      return NextResponse.json(
        {
          error: `Unknown job: '${name}'. Valid jobs: ${VALID_JOBS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    const workspaceId = parsed.success ? parsed.data.workspaceId : undefined;

    const jobName = name as JobName;
    const startTime = Date.now();

    let result: unknown;

    switch (jobName) {
      case "instrument-sync": {
        if (!workspaceId) {
          return NextResponse.json(
            { error: "workspaceId is required for instrument-sync" },
            { status: 400 },
          );
        }
        result = await syncInstruments(workspaceId);
        break;
      }

      case "session-check": {
        result = await checkBrokerSessions();
        break;
      }

      case "credit-settlement": {
        result = await settleReservations();
        break;
      }

      case "heartbeat-monitor": {
        result = await checkHeartbeats();
        break;
      }

      case "divergence-check": {
        result = await checkDivergence();
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      job: jobName,
      triggeredBy: userId,
      durationMs,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    console.error(`Failed to run job:`, error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
