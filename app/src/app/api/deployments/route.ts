import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  environment: z
    .enum(["PAPER", "SHADOW_LIVE", "LIVE"])
    .optional(),
  status: z
    .enum(["PENDING", "ACTIVE", "PAUSED", "STOPPED", "FAILED"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createDeploymentSchema = z.object({
  strategyVersionId: z.string().min(1),
  environment: z.enum(["PAPER", "SHADOW_LIVE", "LIVE"]),
  capitalAllocated: z.number().positive(),
  config: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
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

    const { workspaceId, environment, status, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = { workspaceId };
    if (environment) where.environment = environment;
    if (status) where.status = status;

    const [deployments, total] = await Promise.all([
      db.deployment.findMany({
        where,
        include: {
          strategyVersion: {
            select: {
              id: true,
              version: true,
              family: { select: { id: true, name: true } },
            },
          },
          approvalRequest: {
            select: { id: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.deployment.count({ where }),
    ]);

    return NextResponse.json({
      deployments,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list deployments:", error);
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
    const parsed = createDeploymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { strategyVersionId, environment, capitalAllocated, config, description } =
      parsed.data;

    // Verify strategy version exists and get workspace
    const strategyVersion = await db.strategyVersion.findUnique({
      where: { id: strategyVersionId },
      include: {
        family: { select: { workspaceId: true } },
      },
    });
    if (!strategyVersion) {
      return NextResponse.json(
        { error: "Strategy version not found" },
        { status: 404 }
      );
    }

    const workspaceId = strategyVersion.family.workspaceId;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const result = await db.$transaction(async (tx) => {
      const deployment = await tx.deployment.create({
        data: {
          workspaceId,
          strategyVersionId,
          environment,
          capitalAllocated,
          config: config ?? {},
          description: description ?? null,
          status: environment === "LIVE" ? "PENDING" : "ACTIVE",
          createdById: userId,
          deployedAt: environment === "LIVE" ? null : new Date(),
        },
      });

      // If live deployment, create approval request
      let approvalRequest = null;
      if (environment === "LIVE") {
        approvalRequest = await tx.approvalRequest.create({
          data: {
            workspaceId,
            type: "LIVE_DEPLOYMENT",
            entityType: "DEPLOYMENT",
            entityId: deployment.id,
            requestedById: userId,
            status: "PENDING",
            context: {
              environment,
              capitalAllocated,
              strategyVersionId,
              description: description ?? null,
            },
          },
        });

        // Link approval to deployment
        await tx.deployment.update({
          where: { id: deployment.id },
          data: { approvalRequestId: approvalRequest.id },
        });
      }

      return { deployment, approvalRequest };
    });

    return NextResponse.json(
      {
        deployment: result.deployment,
        approvalRequest: result.approvalRequest,
        message:
          environment === "LIVE"
            ? "Deployment created and pending approval"
            : "Deployment created and activated",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
