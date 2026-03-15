import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required").max(1000),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const approval = await db.approvalRequest.findUnique({
      where: { id },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 }
      );
    }

    // Verify membership and role (only OWNER or ADMIN can reject)
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: approval.workspaceId,
        userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can reject requests" },
        { status: 403 }
      );
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { error: `Request is already ${approval.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    const body = await req.json();
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reason } = parsed.data;

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedById: userId,
          reviewerComment: reason,
          reviewedAt: new Date(),
        },
      });

      // If this was a deployment approval, mark the deployment as failed/stopped
      if (updated.entityType === "DEPLOYMENT" && updated.entityId) {
        await tx.deployment.update({
          where: { id: updated.entityId },
          data: {
            status: "STOPPED",
            stoppedAt: new Date(),
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ approval: result });
  } catch (error) {
    console.error("Failed to reject request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
