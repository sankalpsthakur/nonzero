import {
  ApprovalStatus,
  ApprovalType,
  DeploymentStatus,
  MemberRole,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const REVIEWER_ROLES: MemberRole[] = [MemberRole.OWNER, MemberRole.ADMIN];

const rejectSchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required").max(1000),
});

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDeploymentId(payload: Prisma.JsonValue): string | null {
  if (!isJsonObject(payload)) {
    return null;
  }

  const deploymentId = payload.deploymentId;
  return typeof deploymentId === "string" && deploymentId.length > 0
    ? deploymentId
    : null;
}

function withReviewMetadata(
  payload: Prisma.JsonValue,
  review: Record<string, unknown>,
): Prisma.InputJsonValue {
  if (isJsonObject(payload)) {
    const currentReview = isJsonObject(payload.review) ? payload.review : {};
    return {
      ...payload,
      review: {
        ...currentReview,
        ...review,
      },
    } as Prisma.InputJsonObject;
  }

  return {
    request: payload,
    review,
  } as Prisma.InputJsonObject;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const approval = await db.approvalRequest.findUnique({
      where: { id },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: approval.workspaceId,
        userId: auth.userId,
        role: { in: REVIEWER_ROLES },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can reject requests" },
        { status: 403 },
      );
    }

    if (approval.requestedById === auth.userId) {
      return NextResponse.json(
        { error: "Cannot review your own approval request" },
        { status: 403 },
      );
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        { error: `Request is already ${approval.status.toLowerCase()}` },
        { status: 409 },
      );
    }

    const parsed = rejectSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { reason } = parsed.data;
    const deploymentId =
      approval.type === ApprovalType.DEPLOY_LIVE
        ? extractDeploymentId(approval.payload)
        : null;

    const result = await db.$transaction(async (tx) => {
      const updatedApproval = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.REJECTED,
          reviewedById: auth.userId,
          reviewedAt: new Date(),
          payload: withReviewMetadata(approval.payload, {
            decision: ApprovalStatus.REJECTED,
            comment: reason,
          }),
        },
        include: {
          requestedBy: {
            select: { id: true, name: true, email: true },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      let deployment = null;
      if (deploymentId) {
        deployment = await tx.deployment.updateMany({
          where: {
            id: deploymentId,
            workspaceId: approval.workspaceId,
            status: {
              in: [
                DeploymentStatus.PENDING_APPROVAL,
                DeploymentStatus.APPROVED,
              ],
            },
          },
          data: {
            status: DeploymentStatus.REJECTED,
          },
        });
      }

      return { approval: updatedApproval, deployment };
    });

    const rejectedDeployment =
      deploymentId && result.deployment && result.deployment.count > 0
        ? await db.deployment.findUnique({
            where: { id: deploymentId },
            select: {
              id: true,
              environment: true,
              status: true,
              capitalAllocated: true,
              approvedAt: true,
              activatedAt: true,
            },
          })
        : null;

    return NextResponse.json({
      approval: result.approval,
      deployment: rejectedDeployment,
      message: rejectedDeployment
        ? "Rejection recorded. Deployment has been marked rejected."
        : "Rejection recorded",
    });
  } catch (error) {
    console.error("Failed to reject request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
