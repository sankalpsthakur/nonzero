import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const terminateSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const run = await db.run.findUnique({
      where: { id },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
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

    // Check if run can be stopped
    const stoppableStatuses = ["PENDING", "RUNNING"];
    if (!stoppableStatuses.includes(run.status)) {
      return NextResponse.json(
        {
          error: `Cannot terminate a run with status '${run.status}'. Only PENDING or RUNNING runs can be terminated.`,
        },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = terminateSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    // Update run and create termination event
    const updatedRun = await db.$transaction(async (tx) => {
      const updated = await tx.run.update({
        where: { id },
        data: {
          status: "STOPPED",
          completedAt: new Date(),
        },
      });

      // Mark active attempts as cancelled
      await tx.runAttempt.updateMany({
        where: {
          runId: id,
          status: { in: ["PENDING", "RUNNING"] },
        },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(),
        },
      });

      // Create termination event
      await tx.runEvent.create({
        data: {
          runId: id,
          type: "RUN_TERMINATED",
          payload: {
            terminatedBy: userId,
            reason: reason ?? "Manual termination",
            previousStatus: run.status,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ run: updatedRun });
  } catch (error) {
    console.error("Failed to terminate run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
