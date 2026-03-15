import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const listQuerySchema = z.object({
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const createEventSchema = z.object({
  type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).default({}),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: runId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify run exists and user has access
    const run = await db.run.findUnique({
      where: { id: runId },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    const { type, limit, offset } = parsed.success
      ? parsed.data
      : { type: undefined, limit: 50, offset: 0 };

    const where: Record<string, unknown> = { runId };
    if (type) where.type = type;

    const [events, total] = await Promise.all([
      db.runEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.runEvent.count({ where }),
    ]);

    return NextResponse.json({
      events,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list run events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: runId } = await params;
    // Events can be posted by sandboxes without standard user auth
    // but we still validate the run exists
    const run = await db.run.findUnique({
      where: { id: runId },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "STOPPED") {
      return NextResponse.json(
        { error: "Cannot add events to a terminated run" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, payload } = parsed.data;

    const event = await db.runEvent.create({
      data: {
        runId,
        type,
        payload,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Failed to create run event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
