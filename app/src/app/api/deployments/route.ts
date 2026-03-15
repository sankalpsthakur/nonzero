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

const DEPLOYMENT_MUTATION_ROLES: MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.TRADER,
];

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  environment: z.nativeEnum(DeploymentEnvironment).optional(),
  status: z.nativeEnum(DeploymentStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createDeploymentSchema = z.object({
  strategyVersionId: z.string().min(1),
  environment: z.nativeEnum(DeploymentEnvironment),
  capitalAllocated: z.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = listQuerySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      environment: req.nextUrl.searchParams.get("environment") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, environment, status, limit, offset } = parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where = {
      workspaceId,
      ...(environment ? { environment } : {}),
      ...(status ? { status } : {}),
    };

    const [deployments, total] = await Promise.all([
      db.deployment.findMany({
        where,
        include: {
          strategyVersion: {
            select: {
              id: true,
              version: true,
              status: true,
              createdAt: true,
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.deployment.count({ where }),
    ]);

    return NextResponse.json({
      deployments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Failed to list deployments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createDeploymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { strategyVersionId, environment, capitalAllocated } = parsed.data;

    const strategyVersion = await db.strategyVersion.findUnique({
      where: { id: strategyVersionId },
      include: {
        family: {
          select: {
            id: true,
            workspaceId: true,
            name: true,
          },
        },
      },
    });

    if (!strategyVersion) {
      return NextResponse.json(
        { error: "Strategy version not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: strategyVersion.family.workspaceId,
        userId: auth.userId,
        role: { in: DEPLOYMENT_MUTATION_ROLES },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Only workspace owners, admins, or traders can create deployments" },
        { status: 403 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      const deployment = await tx.deployment.create({
        data: {
          workspaceId: strategyVersion.family.workspaceId,
          strategyVersionId,
          environment,
          capitalAllocated,
          status:
            environment === DeploymentEnvironment.LIVE
              ? DeploymentStatus.PENDING_APPROVAL
              : DeploymentStatus.ACTIVE,
          activatedAt:
            environment === DeploymentEnvironment.LIVE ? null : new Date(),
        },
        include: {
          strategyVersion: {
            select: {
              id: true,
              version: true,
              status: true,
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
      if (environment === DeploymentEnvironment.LIVE) {
        approvalRequest = await tx.approvalRequest.create({
          data: {
            workspaceId: strategyVersion.family.workspaceId,
            type: ApprovalType.DEPLOY_LIVE,
            status: ApprovalStatus.PENDING,
            requestedById: auth.userId,
            payload: {
              deploymentId: deployment.id,
              strategyVersionId,
              strategyFamilyId: strategyVersion.family.id,
              strategyFamilyName: strategyVersion.family.name,
              version: strategyVersion.version,
              environment,
              capitalAllocated: capitalAllocated ?? null,
            },
          },
        });
      }

      return { deployment, approvalRequest };
    });

    return NextResponse.json(
      {
        deployment: result.deployment,
        approvalRequest: result.approvalRequest,
        message:
          environment === DeploymentEnvironment.LIVE
            ? "Deployment created and queued for approval"
            : "Deployment created and activated",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
