import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const listQuerySchema = z.object({
  agentId: z.string().optional(),
  workspaceId: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createTaskSchema = z.object({
  agentId: z.string().min(1),
  type: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  input: z.record(z.unknown()).default({}),
  deadline: z.coerce.date().optional(),
  parentTaskId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      agentId: searchParams.get("agentId") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { agentId, workspaceId, status, type, limit, offset } = parsed.data;

    if (!agentId && !workspaceId) {
      return NextResponse.json(
        { error: "Either agentId or workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify membership if workspaceId provided
    if (workspaceId) {
      const membership = await db.workspaceMembership.findFirst({
        where: { workspaceId, userId },
      });
      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (workspaceId) where.agent = { workspaceId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [tasks, total] = await Promise.all([
      db.agentTask.findMany({
        where,
        include: {
          agent: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.agentTask.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list tasks:", error);
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
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { agentId, type, description, priority, input, deadline, parentTaskId } =
      parsed.data;

    // Verify agent exists and user has access
    const agent = await db.agentProfile.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: agent.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (agent.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Cannot assign tasks to an inactive agent" },
        { status: 409 }
      );
    }

    const task = await db.agentTask.create({
      data: {
        agentId,
        type,
        description,
        priority,
        input,
        status: "PENDING",
        deadline: deadline ?? null,
        parentTaskId: parentTaskId ?? null,
        createdById: userId,
      },
      include: {
        agent: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
