import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const forkSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  hypothesis: z.string().min(1).max(2000).optional(),
  environment: z.enum(["RESEARCH", "PAPER", "SHADOW_LIVE", "LIVE"]).default("RESEARCH"),
  config: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = forkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, hypothesis, environment, config } = parsed.data;

    // Fetch source experiment
    const source = await db.experiment.findUnique({
      where: { id },
      include: {
        family: { select: { id: true, workspaceId: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { config: true },
        },
      },
    });

    if (!source) {
      return NextResponse.json(
        { error: "Source experiment not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: source.family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create forked experiment and initial run in a transaction
    const result = await db.$transaction(async (tx) => {
      const forkedExperiment = await tx.experiment.create({
        data: {
          familyId: source.familyId,
          workspaceId: source.workspaceId,
          name: name ?? `${source.name} (fork)`,
          description: source.description,
          hypothesis: hypothesis ?? source.hypothesis,
          objective: source.objective,
        },
      });

      // Create initial run based on the source's latest run config
      const sourceConfig =
        config ?? (source.runs[0]?.config as Record<string, unknown>) ?? {};

      const run = await tx.run.create({
        data: {
          experimentId: forkedExperiment.id,
          workspaceId: source.workspaceId,
          environment,
          hypothesis: hypothesis ?? source.hypothesis,
          config: sourceConfig as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

      // Create initial run attempt
      await tx.runAttempt.create({
        data: {
          runId: run.id,
          attemptNumber: 1,
          status: "PENDING",
          startedAt: new Date(),
        },
      });

      return { experiment: forkedExperiment, run };
    });

    return NextResponse.json(
      {
        experiment: result.experiment,
        run: result.run,
        forkedFrom: { id: source.id, name: source.name },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to fork experiment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
