import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { requireWorkspaceMembership } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const auth = await requireWorkspaceMembership(req, agent.workspaceId);
    if (!auth) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const taskStats = await db.agentTask.groupBy({
      by: ["status"],
      where: { agentId: id },
      _count: true,
    });

    const statusCounts = taskStats.reduce<Record<string, number>>((acc, stat) => {
      acc[stat.status] = stat._count;
      return acc;
    }, {});

    const totalCompleted = (statusCounts.SUCCESS ?? 0) + (statusCounts.FAILED ?? 0);
    const successRate =
      totalCompleted > 0 ? ((statusCounts.SUCCESS ?? 0) / totalCompleted) * 100 : null;

    return NextResponse.json({
      agent: {
        ...agent,
        stats: {
          taskStatusCounts: statusCounts,
          totalTasks: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
          successRate: successRate === null ? null : Math.round(successRate * 100) / 100,
          recentTasks: agent.tasks.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get agent:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
