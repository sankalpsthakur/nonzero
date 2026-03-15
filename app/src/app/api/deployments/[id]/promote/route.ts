import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const promoteSchema = z.object({
  capitalAllocated: z.number().positive().optional(),
  description: z.string().max(1000).optional(),
});

const PROMOTION_PATH: Record<string, string> = {
  PAPER: "SHADOW_LIVE",
  SHADOW_LIVE: "LIVE",
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deployment = await db.deployment.findUnique({
      where: { id },
      include: {
        strategyVersion: { select: { id: true } },
      },
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: deployment.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (deployment.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active deployments can be promoted" },
        { status: 409 }
      );
    }

    const nextEnvironment = PROMOTION_PATH[deployment.environment];
    if (!nextEnvironment) {
      return NextResponse.json(
        { error: "This deployment is already at the highest environment (LIVE)" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = promoteSchema.safeParse(body);
    const { capitalAllocated, description } = parsed.success
      ? parsed.data
      : { capitalAllocated: undefined, description: undefined };

    const result = await db.$transaction(async (tx) => {
      // Stop the current deployment
      await tx.deployment.update({
        where: { id },
        data: { status: "STOPPED", stoppedAt: new Date() },
      });

      // Create the new promoted deployment
      const promoted = await tx.deployment.create({
        data: {
          workspaceId: deployment.workspaceId,
          strategyVersionId: deployment.strategyVersionId,
          environment: nextEnvironment,
          capitalAllocated: capitalAllocated ?? deployment.capitalAllocated,
          config: deployment.config as Record<string, unknown>,
          description: description ?? `Promoted from ${deployment.environment}`,
          status: nextEnvironment === "LIVE" ? "PENDING" : "ACTIVE",
          createdById: userId,
          promotedFromId: deployment.id,
          deployedAt: nextEnvironment === "LIVE" ? null : new Date(),
        },
      });

      // If promoting to LIVE, create approval request
      let approvalRequest = null;
      if (nextEnvironment === "LIVE") {
        approvalRequest = await tx.approvalRequest.create({
          data: {
            workspaceId: deployment.workspaceId,
            type: "LIVE_DEPLOYMENT",
            entityType: "DEPLOYMENT",
            entityId: promoted.id,
            requestedById: userId,
            status: "PENDING",
            context: {
              environment: nextEnvironment,
              capitalAllocated: capitalAllocated ?? deployment.capitalAllocated,
              promotedFrom: deployment.id,
              previousEnvironment: deployment.environment,
            },
          },
        });

        await tx.deployment.update({
          where: { id: promoted.id },
          data: { approvalRequestId: approvalRequest.id },
        });
      }

      return { promoted, approvalRequest };
    });

    return NextResponse.json({
      deployment: result.promoted,
      approvalRequest: result.approvalRequest,
      previousDeploymentId: id,
      message:
        nextEnvironment === "LIVE"
          ? "Promoted to LIVE - pending approval"
          : `Promoted to ${nextEnvironment}`,
    });
  } catch (error) {
    console.error("Failed to promote deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
