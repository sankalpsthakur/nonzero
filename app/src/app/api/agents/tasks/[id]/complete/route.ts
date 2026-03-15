import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest, requireWorkspaceMembership } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const completeSchema = z.object({
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED", "STOPPED", "COMPLETED"]),
  output: z.record(z.unknown()).default({}),
  error: z.string().max(2000).optional(),
  metrics: z
    .object({
      durationMs: z.number().int().nonnegative().optional(),
      tokensUsed: z.number().int().nonnegative().optional(),
      cost: z.number().nonnegative().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = await db.agentTask.findUnique({
      where: { id },
      include: {
        agent: { select: { workspaceId: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const auth = await getAuthFromRequest(req);
    if (auth) {
      const membership = await requireWorkspaceMembership(req, task.agent.workspaceId);
      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    if (!["PENDING", "IN_PROGRESS"].includes(task.status)) {
      return NextResponse.json(
        {
          error: `Cannot complete a task with status '${task.status}'. Only PENDING or IN_PROGRESS tasks can be completed.`,
        },
        { status: 409 },
      );
    }

    const body = await req.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const status = parsed.data.status === "COMPLETED" ? "SUCCESS" : parsed.data.status;
    const taskOutput = {
      ...parsed.data.output,
      ...(parsed.data.error ? { error: parsed.data.error } : {}),
      ...(parsed.data.metrics ? { metrics: parsed.data.metrics } : {}),
    } satisfies Record<string, unknown>;

    const updatedTask = await db.agentTask.update({
      where: { id },
      data: {
        status,
        output: taskOutput as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
      include: {
        agent: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("Failed to complete task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
