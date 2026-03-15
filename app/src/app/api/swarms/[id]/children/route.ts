import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  status: z
    .enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "STOPPED", "CANCELLED"])
    .optional(),
  sortBy: z.enum(["createdAt", "score", "status"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: swarmId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify swarm exists and user has access
    const swarm = await db.swarm.findUnique({
      where: { id: swarmId },
    });
    if (!swarm) {
      return NextResponse.json({ error: "Swarm not found" }, { status: 404 });
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: swarm.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    const { status, sortBy, order, limit, offset } = parsed.success
      ? parsed.data
      : { status: undefined, sortBy: "createdAt" as const, order: "desc" as const, limit: 20, offset: 0 };

    const where: Record<string, unknown> = { swarmId };
    if (status) where.status = status;

    const [children, total] = await Promise.all([
      db.swarmChild.findMany({
        where,
        include: {
          run: {
            select: {
              id: true,
              status: true,
              environment: true,
              startedAt: true,
              completedAt: true,
            },
          },
          _count: { select: { events: true } },
        },
        orderBy: { [sortBy]: order },
        take: limit,
        skip: offset,
      }),
      db.swarmChild.count({ where }),
    ]);

    // Compute aggregate stats
    const stats = await db.swarmChild.aggregate({
      where: { swarmId },
      _avg: { score: true },
      _max: { score: true },
      _min: { score: true },
      _count: true,
    });

    return NextResponse.json({
      children,
      stats: {
        total: stats._count,
        avgScore: stats._avg.score,
        maxScore: stats._max.score,
        minScore: stats._min.score,
      },
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list swarm children:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
