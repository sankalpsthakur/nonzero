import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const experiment = await db.experiment.findUnique({
      where: { id },
      include: {
        family: {
          select: { id: true, name: true, workspaceId: true },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!experiment) {
      return NextResponse.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: experiment.family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Compute summary stats
    const runStatusCounts = experiment.runs.reduce(
      (acc, run) => {
        acc[run.status] = (acc[run.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      experiment: {
        ...experiment,
        summary: {
          totalRuns: experiment.runs.length,
          runStatusCounts,
          latestRunId: experiment.runs[0]?.id ?? null,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get experiment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
