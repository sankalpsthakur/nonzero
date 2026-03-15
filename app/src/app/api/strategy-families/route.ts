import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createFamilySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  asset: z.string().min(1).max(100),
  exchange: z.string().min(1).max(50),
  timeframe: z.string().min(1).max(50),
  tags: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const [families, total] = await Promise.all([
      db.strategyFamily.findMany({
        where: { workspaceId },
        include: {
          _count: {
            select: {
              versions: true,
              experiments: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.strategyFamily.count({ where: { workspaceId } }),
    ]);

    return NextResponse.json({
      families,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list strategy families:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createFamilySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, name, description, asset, exchange, timeframe, tags } =
      parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check for duplicate name in workspace
    const existing = await db.strategyFamily.findFirst({
      where: { workspaceId, name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A strategy family with this name already exists" },
        { status: 409 }
      );
    }

    const family = await db.strategyFamily.create({
      data: {
        workspaceId,
        name,
        description: description ?? null,
        asset,
        exchange,
        timeframe,
        tags,
        createdById: userId,
      },
    });

    return NextResponse.json({ family }, { status: 201 });
  } catch (error) {
    console.error("Failed to create strategy family:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
