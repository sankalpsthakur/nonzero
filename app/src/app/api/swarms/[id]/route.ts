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

    const swarm = await db.swarm.findUnique({
      where: { id },
      include: {
        family: { select: { id: true, name: true } },
        children: {
          include: {
            run: {
              select: {
                id: true,
                status: true,
                environment: true,
                sandboxId: true,
                startedAt: true,
                completedAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
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

    const creditReservation = swarm.creditReservationId
      ? await db.creditReservation.findUnique({
          where: { id: swarm.creditReservationId },
          include: {
            account: {
              select: {
                id: true,
                bucket: true,
              },
            },
          },
        })
      : null;

    return NextResponse.json({
      swarm: {
        ...swarm,
        creditReservation,
        summary: {
          totalChildren: swarm.children.length,
          childStatusCounts,
          creditBudget: creditReservation?.amount ?? null,
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
