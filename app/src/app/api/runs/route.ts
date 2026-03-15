import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

const listQuerySchema = z.object({
  experimentId: z.string().optional(),
  workspaceId: z.string().optional(),
  environment: z
    .enum(["RESEARCH", "PAPER", "SHADOW_LIVE", "LIVE"])
    .optional(),
  status: z
    .enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "STOPPED"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createRunSchema = z.object({
  experimentId: z.string().min(1, "experimentId is required"),
  environment: z.enum(["RESEARCH", "PAPER", "SHADOW_LIVE", "LIVE"]),
  hypothesis: z.string().max(2000).optional(),
  config: z.record(z.unknown()).default({}),
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
      experimentId: searchParams.get("experimentId") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      environment: searchParams.get("environment") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { experimentId, workspaceId, environment, status, limit, offset } =
      parsed.data;

    // Must provide at least experimentId or workspaceId
    if (!experimentId && !workspaceId) {
      return NextResponse.json(
        { error: "Either experimentId or workspaceId is required" },
        { status: 400 }
      );
    }

    // If workspaceId, verify membership
    if (workspaceId) {
      const membership = await db.workspaceMembership.findFirst({
        where: { workspaceId, userId },
      });
      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const where: Record<string, unknown> = {};
    if (experimentId) where.experimentId = experimentId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (environment) where.environment = environment;
    if (status) where.status = status;

    const [runs, total] = await Promise.all([
      db.run.findMany({
        where,
        include: {
          experiment: {
            select: { id: true, name: true, familyId: true },
          },
          _count: { select: { events: true, artifacts: true, attempts: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.run.count({ where }),
    ]);

    return NextResponse.json({
      runs,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list runs:", error);
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
    const parsed = createRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { experimentId, environment, hypothesis, config } = parsed.data;

    // Verify experiment exists and user has access
    const experiment = await db.experiment.findUnique({
      where: { id: experimentId },
      include: {
        family: { select: { workspaceId: true } },
      },
    });
    if (!experiment) {
      return NextResponse.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: experiment.family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create run and initial attempt in a transaction
    const result = await db.$transaction(async (tx) => {
      const run = await tx.run.create({
        data: {
          experimentId,
          workspaceId: experiment.family.workspaceId,
          environment,
          hypothesis: hypothesis ?? null,
          config: config as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

      const attempt = await tx.runAttempt.create({
        data: {
          runId: run.id,
          attemptNumber: 1,
          status: "PENDING",
          startedAt: new Date(),
        },
      });

      return { run, attempt };
    });

    return NextResponse.json(
      { run: result.run, attempt: result.attempt },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
