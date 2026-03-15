import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]).optional(),
  type: z
    .enum(["DIVERGENCE", "RISK_BREACH", "EXECUTION_FAILURE", "SYSTEM_ERROR"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createIncidentSchema = z.object({
  workspaceId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  divergenceReportId: z.string().min(1).optional(),
  type: z.enum([
    "DIVERGENCE",
    "RISK_BREACH",
    "EXECUTION_FAILURE",
    "SYSTEM_ERROR",
  ]),
  description: z.string().min(1).max(5000),
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
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status, type, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = { workspaceId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: {
          deployment: {
            select: {
              id: true,
              environment: true,
              status: true,
              strategyVersion: {
                select: {
                  id: true,
                  version: true,
                  family: { select: { id: true, name: true } },
                },
              },
            },
          },
          divergenceReport: {
            select: {
              id: true,
              divergenceScore: true,
              severity: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.incident.count({ where }),
    ]);

    return NextResponse.json({
      incidents,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list incidents:", error);
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
    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, deploymentId, divergenceReportId, type, description } =
      parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify deployment belongs to workspace if provided
    if (deploymentId) {
      const deployment = await db.deployment.findFirst({
        where: { id: deploymentId, workspaceId },
      });
      if (!deployment) {
        return NextResponse.json(
          { error: "Deployment not found in this workspace" },
          { status: 404 }
        );
      }
    }

    // Verify divergence report belongs to workspace if provided
    if (divergenceReportId) {
      const report = await db.divergenceReport.findFirst({
        where: { id: divergenceReportId, workspaceId },
      });
      if (!report) {
        return NextResponse.json(
          { error: "Divergence report not found in this workspace" },
          { status: 404 }
        );
      }
    }

    const incident = await db.incident.create({
      data: {
        workspaceId,
        deploymentId: deploymentId ?? null,
        divergenceReportId: divergenceReportId ?? null,
        type,
        status: "OPEN",
        description,
      },
    });

    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    console.error("Failed to create incident:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
