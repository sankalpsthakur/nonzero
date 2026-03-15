import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { SandboxInfo } from "@/lib/modal/types";

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Stub: Modal client
// ---------------------------------------------------------------------------

/**
 * Retrieves detailed status for a single sandbox from the Modal API.
 */
async function modalGetSandbox(sandboxId: string): Promise<SandboxInfo | null> {
  // TODO: replace with actual Modal SDK call
  void sandboxId;
  return null;
}

/**
 * Terminates a running sandbox via the Modal API.
 */
async function modalTerminateSandbox(sandboxId: string): Promise<void> {
  // TODO: replace with actual Modal SDK call
  void sandboxId;
}

// ---------------------------------------------------------------------------
// GET /api/sandboxes/[id] — Get sandbox status and details
// ---------------------------------------------------------------------------

/**
 * Returns detailed status for a single sandbox, combining the Modal API
 * response with the associated run record from the local database.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: sandboxId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the run associated with this sandbox
    const run = await db.run.findFirst({
      where: { sandboxId },
      include: {
        experiment: {
          select: {
            id: true,
            name: true,
            family: { select: { id: true, name: true, workspaceId: true } },
          },
        },
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Sandbox not found or not associated with any run" },
        { status: 404 },
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch live status from Modal
    const sandboxInfo = await modalGetSandbox(sandboxId);

    return NextResponse.json({
      sandbox: sandboxInfo,
      run: {
        id: run.id,
        status: run.status,
        environment: run.environment,
        sandboxId: run.sandboxId,
        sandboxName: run.sandboxName,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        experiment: run.experiment,
        latestAttempt: run.attempts[0] ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to get sandbox:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sandboxes/[id] — Terminate a sandbox
// ---------------------------------------------------------------------------

/**
 * Terminates a running sandbox. This sends a kill signal via the Modal API
 * and updates the associated run record to STOPPED.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: sandboxId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the run associated with this sandbox
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

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Only running / pending sandboxes can be terminated
    const terminableStatuses = ["PENDING", "RUNNING"];
    if (!terminableStatuses.includes(run.status)) {
      return NextResponse.json(
        {
          error: `Cannot terminate sandbox for a run with status '${run.status}'. Only PENDING or RUNNING runs can be terminated.`,
        },
        { status: 409 },
      );
    }

    // Terminate sandbox via Modal
    await modalTerminateSandbox(sandboxId);

    // Update run in local DB
    const updatedRun = await db.$transaction(async (tx) => {
      const updated = await tx.run.update({
        where: { id: run.id },
        data: {
          status: "STOPPED",
          completedAt: new Date(),
        },
      });

      // Mark active attempts as cancelled
      await tx.runAttempt.updateMany({
        where: {
          runId: run.id,
          status: { in: ["PENDING", "RUNNING"] },
        },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
        },
      });

      // Record termination event
      await tx.runEvent.create({
        data: {
          runId: run.id,
          type: "LOG",
          payload: {
            action: "sandbox_terminated",
            terminatedBy: userId,
            sandboxId,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      message: "Sandbox terminated successfully",
      run: updatedRun,
    });
  } catch (error) {
    console.error("Failed to terminate sandbox:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
