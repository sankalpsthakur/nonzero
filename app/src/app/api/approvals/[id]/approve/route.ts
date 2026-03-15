import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const approveSchema = z.object({
  comment: z.string().max(1000).optional(),
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

    // Verify membership and role (only OWNER or ADMIN can approve)
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: approval.workspaceId,
        userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can approve requests" },
        { status: 403 }
      );
    }

    // Cannot approve own request
    if (approval.requestedById === userId) {
      return NextResponse.json(
        { error: "Cannot approve your own request" },
        { status: 403 }
      );
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { error: `Request is already ${approval.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = approveSchema.safeParse(body);
    const comment = parsed.success ? parsed.data.comment : undefined;

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: userId,
          reviewerComment: comment ?? null,
          reviewedAt: new Date(),
        },
      });

      // If this approval is for a deployment, activate it
      if (updated.entityType === "DEPLOYMENT" && updated.entityId) {
        await tx.deployment.update({
          where: { id: updated.entityId },
          data: {
            status: "ACTIVE",
            deployedAt: new Date(),
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ approval: result });
  } catch (error) {
    console.error("Failed to approve request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
