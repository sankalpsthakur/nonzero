import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const completeSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
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
    const userId = req.headers.get("x-user-id");
    // Tasks can also be completed by the agent itself (system), so auth is optional
    // but we still validate the task exists

    const task = await db.agentTask.findUnique({
      where: { id },
      include: {
        agent: { select: { workspaceId: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // If user is authenticated, verify membership
    if (userId) {
      const membership = await db.workspaceMembership.findFirst({
        where: { workspaceId: task.agent.workspaceId, userId },
      });
      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const completableStatuses = ["PENDING", "IN_PROGRESS"];
    if (!completableStatuses.includes(task.status)) {
      return NextResponse.json(
        {
          error: `Cannot complete a task with status '${task.status}'. Only PENDING or IN_PROGRESS tasks can be completed.`,
        },
        { status: 409 }
      );
    }

    const body = await req.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { status, output, error: taskError, metrics } = parsed.data;

    const updatedTask = await db.agentTask.update({
      where: { id },
      data: {
        status,
        output,
        error: taskError ?? null,
        completedAt: new Date(),
        durationMs: metrics?.durationMs ?? null,
        tokensUsed: metrics?.tokensUsed ?? null,
        cost: metrics?.cost ?? null,
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
      { status: 500 }
    );
  }
}
