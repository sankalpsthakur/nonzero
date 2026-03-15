import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { requireWorkspaceMembership } from "@/lib/auth";

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, limit, offset } = parsed.data;
    const auth = await requireWorkspaceMembership(req, workspaceId);
    if (!auth) {
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
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createFamilySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, name, description, asset, exchange, timeframe, tags } =
      parsed.data;
    const auth = await requireWorkspaceMembership(req, workspaceId);
    if (!auth) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const slug = slugify(name);
    const existing = await db.strategyFamily.findFirst({
      where: { workspaceId, slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A strategy family with this name already exists" },
        { status: 409 },
      );
    }

    const family = await db.strategyFamily.create({
      data: {
        workspaceId,
        slug,
        name,
        description: description ?? null,
        objective: `${asset} on ${exchange} (${timeframe})`,
        benchmark: `${exchange}:${asset}`,
        universe: {
          asset,
          exchange,
          timeframe,
          tags,
        },
      },
    });

    return NextResponse.json({ family }, { status: 201 });
  } catch (error) {
    console.error("Failed to create strategy family:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
