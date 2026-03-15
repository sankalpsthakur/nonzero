import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import type { ExecResult } from "@/lib/modal/types";

type RouteParams = { params: Promise<{ id: string }> };

const execSchema = z.object({
  command: z
    .array(z.string())
    .min(1, "command must contain at least one element"),
});

// ---------------------------------------------------------------------------
// Stub: Modal client
// ---------------------------------------------------------------------------

/**
 * Executes a command inside a running Modal sandbox and returns the result.
 *
 * @param sandboxId - The Modal sandbox identifier.
 * @param command   - The command as an array of strings (argv).
 */
async function modalExec(
  sandboxId: string,
  command: string[],
): Promise<ExecResult> {
  // TODO: replace with actual Modal SDK call
  void sandboxId;
  void command;
  return { exitCode: -1, stdout: "", stderr: "Modal exec not implemented" };
}

// ---------------------------------------------------------------------------
// POST /api/sandboxes/[id]/exec — Execute command inside sandbox
// ---------------------------------------------------------------------------

/**
 * Execute an arbitrary command inside a running sandbox. The command is
 * passed as an argv-style string array. Returns the process exit code,
 * stdout, and stderr.
 *
 * Body: `{ command: string[] }`
 * Response: `{ exitCode: number, stdout: string, stderr: string }`
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    // Only RUNNING sandboxes can accept exec commands
    if (run.status !== "RUNNING") {
      return NextResponse.json(
        {
          error: `Cannot execute command in a sandbox with run status '${run.status}'. The run must be RUNNING.`,
        },
        { status: 409 },
      );
    }

    // Validate body
    const body = await req.json();
    const parsed = execSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { command } = parsed.data;

    // Execute command inside sandbox
    const result = await modalExec(sandboxId, command);

    return NextResponse.json({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    console.error("Failed to exec in sandbox:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
