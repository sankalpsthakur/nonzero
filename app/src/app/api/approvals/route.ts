import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createApprovalSchema = z.object({
  workspaceId: z.string().min(1),
  type: z.string().min(1).max(100),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1),
  context: z.record(z.unknown()).default({}),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
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
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = { workspaceId };
    if (status) {
      where.status = status;
    } else {
      // Default to pending approvals
      where.status = "PENDING";
    }

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

    return NextResponse.json({
      approvals,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list approvals:", error);
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
    const parsed = createApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, type, entityType, entityId, context, urgency } =
      parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check for duplicate pending approval
    const existing = await db.approvalRequest.findFirst({
      where: {
        workspaceId,
        entityType,
        entityId,
        status: "PENDING",
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A pending approval request already exists for this entity" },
        { status: 409 }
      );
    }

    const approval = await db.approvalRequest.create({
      data: {
        workspaceId,
        type,
        entityType,
        entityId,
        context,
        urgency,
        requestedById: userId,
        status: "PENDING",
      },
    });

    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    console.error("Failed to create approval:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
