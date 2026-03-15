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

    const swarm = await db.swarm.findUnique({
      where: { id },
      include: {
        family: { select: { id: true, name: true } },
        children: {
          include: {
            _count: { select: { events: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        creditReservation: {
          include: {
            account: { select: { type: true, currency: true } },
          },
        },
        metrics: {
          orderBy: { recordedAt: "desc" },
          take: 100,
        },
      },
    });

    if (!swarm) {
      return NextResponse.json({ error: "Swarm not found" }, { status: 404 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: swarm.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Compute child status distribution
    const childStatusCounts = swarm.children.reduce(
      (acc, child) => {
        acc[child.status] = (acc[child.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      swarm: {
        ...swarm,
        summary: {
          totalChildren: swarm.children.length,
          childStatusCounts,
          totalMetrics: swarm.metrics.length,
          creditBudget: swarm.creditReservation?.amount ?? null,
          creditConsumed: swarm.creditReservation?.consumed ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get swarm:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
