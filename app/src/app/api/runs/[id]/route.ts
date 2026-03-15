import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
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
          select: {
            id: true,
            name: true,
            family: { select: { id: true, name: true, workspaceId: true } },
          },
        },
        attempts: {
          orderBy: { attemptNumber: "asc" },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        artifacts: {
          orderBy: { createdAt: "desc" },
        },
        metrics: {
          orderBy: { recordedAt: "desc" },
          take: 200,
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

    // Compute duration if run has started
    let durationMs: number | null = null;
    if (run.startedAt) {
      const endTime = run.completedAt ?? new Date();
      durationMs = endTime.getTime() - run.startedAt.getTime();
    }

    return NextResponse.json({
      run: {
        ...run,
        durationMs,
        summary: {
          totalAttempts: run.attempts.length,
          totalEvents: run.events.length,
          totalArtifacts: run.artifacts.length,
          totalMetrics: run.metrics.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
