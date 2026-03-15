import {
  ApprovalStatus,
  ApprovalType,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import db from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.nativeEnum(ApprovalStatus).optional(),
  type: z.nativeEnum(ApprovalType).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createApprovalSchema = z.object({
  workspaceId: z.string().min(1),
  type: z.nativeEnum(ApprovalType),
  payload: z.record(z.string(), z.unknown()),
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

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = listQuerySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      type: req.nextUrl.searchParams.get("type") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, status, type, limit, offset } = parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where = {
      workspaceId,
      ...(type ? { type } : {}),
      status: status ?? ApprovalStatus.PENDING,
    };

    const [approvals, total] = await Promise.all([
      db.approvalRequest.findMany({
        where,
        include: {
          requestedBy: {
            select: { id: true, name: true, email: true },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.approvalRequest.count({ where }),
    ]);

    const deploymentIds = Array.from(
      new Set(
        approvals
          .map((approval) => extractDeploymentId(approval.payload))
          .filter((value): value is string => value !== null),
      ),
    );

    const deployments =
      deploymentIds.length > 0
        ? await db.deployment.findMany({
            where: {
              workspaceId,
              id: { in: deploymentIds },
            },
            select: {
              id: true,
              environment: true,
              status: true,
              capitalAllocated: true,
              approvedAt: true,
              activatedAt: true,
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
          })
        : [];

    const deploymentsById = new Map(
      deployments.map((deployment) => [deployment.id, deployment]),
    );

    return NextResponse.json({
      approvals: approvals.map((approval) => ({
        ...approval,
        deployment: (() => {
          const deploymentId = extractDeploymentId(approval.payload);
          return deploymentId ? deploymentsById.get(deploymentId) ?? null : null;
        })(),
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Failed to list approvals:", error);
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
    const parsed = createApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, type, payload } = parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (type === ApprovalType.DEPLOY_LIVE) {
      const deploymentId =
        typeof payload.deploymentId === "string" ? payload.deploymentId : null;

      if (!deploymentId) {
        return NextResponse.json(
          { error: "DEPLOY_LIVE approvals require payload.deploymentId" },
          { status: 400 },
        );
      }

      const deployment = await db.deployment.findFirst({
        where: {
          id: deploymentId,
          workspaceId,
        },
      });

      if (!deployment) {
        return NextResponse.json(
          { error: "Referenced deployment not found in this workspace" },
          { status: 404 },
        );
      }

      const pendingApprovals = await db.approvalRequest.findMany({
        where: {
          workspaceId,
          type: ApprovalType.DEPLOY_LIVE,
          status: ApprovalStatus.PENDING,
        },
        select: {
          id: true,
          payload: true,
        },
      });

      const duplicate = pendingApprovals.find(
        (approval) => extractDeploymentId(approval.payload) === deploymentId,
      );

      if (duplicate) {
        return NextResponse.json(
          { error: "A pending approval request already exists for this deployment" },
          { status: 409 },
        );
      }
    }

    const approval = await db.approvalRequest.create({
      data: {
        workspaceId,
        type,
        payload: payload as Prisma.InputJsonObject,
        requestedById: auth.userId,
        status: ApprovalStatus.PENDING,
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    console.error("Failed to create approval:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
