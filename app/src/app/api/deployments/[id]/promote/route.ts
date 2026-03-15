import {
  ApprovalStatus,
  ApprovalType,
  DeploymentEnvironment,
  DeploymentStatus,
  MemberRole,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const DEPLOYMENT_MUTATION_ROLES: MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.TRADER,
];

const promoteSchema = z.object({
  capitalAllocated: z.number().positive().optional(),
});

const PROMOTION_PATH: Record<DeploymentEnvironment, DeploymentEnvironment | null> =
  {
    [DeploymentEnvironment.PAPER]: DeploymentEnvironment.SHADOW_LIVE,
    [DeploymentEnvironment.SHADOW_LIVE]: DeploymentEnvironment.LIVE,
    [DeploymentEnvironment.LIVE]: null,
  };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const deployment = await db.deployment.findUnique({
      where: { id },
      include: {
        strategyVersion: {
          select: {
            id: true,
            version: true,
            family: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: deployment.workspaceId,
        userId: auth.userId,
        role: { in: DEPLOYMENT_MUTATION_ROLES },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only workspace owners, admins, or traders can promote deployments" },
        { status: 403 },
      );
    }

    if (deployment.status !== DeploymentStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Only active deployments can be promoted" },
        { status: 409 },
      );
    }

    const nextEnvironment = PROMOTION_PATH[deployment.environment];
    if (!nextEnvironment) {
      return NextResponse.json(
        { error: "This deployment is already in the LIVE environment" },
        { status: 409 },
      );
    }

    const parsed = promoteSchema.safeParse(await req.json().catch(() => ({})));
    const capitalAllocated = parsed.success
      ? parsed.data.capitalAllocated
      : undefined;

    const result = await db.$transaction(async (tx) => {
      let previousDeployment = deployment;
      if (nextEnvironment !== DeploymentEnvironment.LIVE) {
        previousDeployment = await tx.deployment.update({
          where: { id: deployment.id },
          data: { status: DeploymentStatus.STOPPED },
          include: {
            strategyVersion: {
              select: {
                id: true,
                version: true,
                family: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        });
      }

      const promotedDeployment = await tx.deployment.create({
        data: {
          workspaceId: deployment.workspaceId,
          strategyVersionId: deployment.strategyVersionId,
          environment: nextEnvironment,
          capitalAllocated: capitalAllocated ?? deployment.capitalAllocated,
          status:
            nextEnvironment === DeploymentEnvironment.LIVE
              ? DeploymentStatus.PENDING_APPROVAL
              : DeploymentStatus.ACTIVE,
          activatedAt:
            nextEnvironment === DeploymentEnvironment.LIVE ? null : new Date(),
        },
        include: {
          strategyVersion: {
            select: {
              id: true,
              version: true,
              family: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      let approvalRequest = null;
      if (nextEnvironment === DeploymentEnvironment.LIVE) {
        approvalRequest = await tx.approvalRequest.create({
          data: {
            workspaceId: deployment.workspaceId,
            type: ApprovalType.DEPLOY_LIVE,
            status: ApprovalStatus.PENDING,
            requestedById: auth.userId,
            payload: {
              deploymentId: promotedDeployment.id,
              promotedFromDeploymentId: deployment.id,
              strategyVersionId: deployment.strategyVersionId,
              strategyFamilyId: deployment.strategyVersion.family.id,
              strategyFamilyName: deployment.strategyVersion.family.name,
              version: deployment.strategyVersion.version,
              environment: nextEnvironment,
              capitalAllocated:
                capitalAllocated ?? deployment.capitalAllocated ?? null,
            },
          },
        });
      }

      return {
        previousDeployment,
        promotedDeployment,
        approvalRequest,
      };
    });

    return NextResponse.json({
      previousDeployment: result.previousDeployment,
      deployment: result.promotedDeployment,
      approvalRequest: result.approvalRequest,
      message:
        nextEnvironment === DeploymentEnvironment.LIVE
          ? "LIVE promotion candidate created and queued for approval"
          : `Deployment promoted to ${nextEnvironment}`,
    });
  } catch (error) {
    console.error("Failed to promote deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
