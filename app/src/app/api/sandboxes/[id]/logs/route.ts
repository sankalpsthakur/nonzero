import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import type { LogEntry } from "@/lib/modal/types";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  since: z.coerce.date().optional(),
  stream: z.enum(["stdout", "stderr"]).optional(),
  limit: z.coerce.number().min(1).max(5000).default(500),
});

// ---------------------------------------------------------------------------
// Stub: Modal client
// ---------------------------------------------------------------------------

/**
 * Fetches log entries from a Modal sandbox.
 *
 * @param sandboxId - The Modal sandbox identifier.
 * @param since     - Only return logs after this ISO-8601 timestamp.
 * @param stream    - Filter by stream type (stdout / stderr).
 * @param limit     - Max number of log lines to return.
 */
async function modalGetLogs(
  sandboxId: string,
  since?: Date,
  stream?: "stdout" | "stderr",
  limit?: number,
): Promise<LogEntry[]> {
  // TODO: replace with actual Modal SDK call
  void sandboxId;
  void since;
  void stream;
  void limit;
  return [];
}

// ---------------------------------------------------------------------------
// GET /api/sandboxes/[id]/logs — Stream sandbox logs
// ---------------------------------------------------------------------------

/**
 * Returns log lines from a sandbox, optionally filtered by a `since`
 * timestamp for incremental fetching. The response is a JSON array of
 * LogEntry objects ordered by timestamp ascending.
 *
 * Query params:
 *   - `since` (ISO-8601) — only return logs after this time.
 *   - `stream` — "stdout" or "stderr" to filter by stream.
 *   - `limit` — max lines (default 500, max 5000).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: sandboxId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify sandbox exists and user has access
    const run = await db.run.findFirst({
      where: { sandboxId },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Sandbox not found or not associated with any run" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      since: searchParams.get("since") ?? undefined,
      stream: searchParams.get("stream") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { since, stream, limit } = parsed.data;

    // Fetch logs from Modal
    const logs = await modalGetLogs(sandboxId, since, stream, limit);

    return NextResponse.json({
      sandboxId,
      logs,
      count: logs.length,
      since: since?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch sandbox logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
