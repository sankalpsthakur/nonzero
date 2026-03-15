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

    const agent = await db.agentProfile.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: agent.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Calculate success rate from completed tasks
    const taskStats = await db.agentTask.groupBy({
      by: ["status"],
      where: { agentId: id },
      _count: true,
    });

    const statusCounts = taskStats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalCompleted = (statusCounts["COMPLETED"] ?? 0) + (statusCounts["FAILED"] ?? 0);
    const successRate =
      totalCompleted > 0
        ? ((statusCounts["COMPLETED"] ?? 0) / totalCompleted) * 100
        : null;

    return NextResponse.json({
      agent: {
        ...agent,
        stats: {
          taskStatusCounts: statusCounts,
          totalTasks: Object.values(statusCounts).reduce((a, b) => a + b, 0),
          successRate: successRate !== null ? Math.round(successRate * 100) / 100 : null,
          recentTasks: agent.tasks.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get agent:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
