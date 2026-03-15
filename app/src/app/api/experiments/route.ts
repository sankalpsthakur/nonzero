import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  familyId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createExperimentSchema = z.object({
  familyId: z.string().min(1, "familyId is required"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  hypothesis: z.string().min(1).max(2000),
  objective: z.string().min(1).max(1000),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      familyId: searchParams.get("familyId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, familyId, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = {
      workspaceId,
    };
    if (familyId) where.familyId = familyId;

    const [experiments, total] = await Promise.all([
      db.experiment.findMany({
        where,
        include: {
          family: { select: { id: true, name: true } },
          _count: { select: { runs: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.experiment.count({ where }),
    ]);

    return NextResponse.json({
      experiments,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list experiments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createExperimentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { familyId, name, description, hypothesis, objective } = parsed.data;

    // Verify family exists and user has access
    const family = await db.strategyFamily.findUnique({
      where: { id: familyId },
    });
    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found" },
        { status: 404 }
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const experiment = await db.experiment.create({
      data: {
        familyId,
        workspaceId: family.workspaceId,
        name,
        description: description ?? null,
        hypothesis,
        objective,
      },
      include: {
        family: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    console.error("Failed to create experiment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
