import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { requireWorkspaceMembership } from "@/lib/auth";

const taskStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "SUCCESS",
  "PARTIAL",
  "BLOCKED",
  "FAILED",
  "STOPPED",
] as const;

const listQuerySchema = z.object({
  agentId: z.string().optional(),
  workspaceId: z.string().optional(),
  status: z.enum(taskStatuses).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createTaskSchema = z.object({
  agentId: z.string().min(1),
  type: z.string().min(1).max(100),
  description: z.string().min(1).max(2000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  input: z.record(z.unknown()).default({}),
  deadline: z.coerce.date().optional(),
  parentTaskId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
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
        { status: 400 },
      );
    }

    const { agentId, workspaceId, status, type, limit, offset } = parsed.data;
    if (!agentId && !workspaceId) {
      return NextResponse.json(
        { error: "Either agentId or workspaceId is required" },
        { status: 400 },
      );
    }

    if (workspaceId) {
      const auth = await requireWorkspaceMembership(req, workspaceId);
      if (!auth) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const where = {
      ...(agentId ? { agentId } : {}),
      ...(workspaceId ? { agent: { workspaceId } } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    };

    const [tasks, total] = await Promise.all([
      db.agentTask.findMany({
        where,
        include: {
          agent: { select: { id: true, name: true, kind: true } },
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
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { agentId, type, description, priority, input, deadline, parentTaskId } =
      parsed.data;

    const agent = await db.agentProfile.findUnique({
      where: { id: agentId },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const auth = await requireWorkspaceMembership(req, agent.workspaceId);
    if (!auth) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (agent.status === "ERROR") {
      return NextResponse.json(
        { error: "Cannot assign tasks to an agent in ERROR state" },
        { status: 409 },
      );
    }

    const taskInput = {
      ...input,
      ...(description ? { description } : {}),
      priority,
      ...(deadline ? { deadline: deadline.toISOString() } : {}),
      ...(parentTaskId ? { parentTaskId } : {}),
      createdById: auth.userId,
    } satisfies Record<string, unknown>;

    const task = await db.agentTask.create({
      data: {
        agentId,
        type,
        input: taskInput as Prisma.InputJsonValue,
        status: "PENDING",
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
      { status: 500 },
    );
  }
}
