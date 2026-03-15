import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const pauseSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deployment = await db.deployment.findUnique({
      where: { id },
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
        { error: "Only active deployments can be paused" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = pauseSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    const updatedDeployment = await db.deployment.update({
      where: { id },
      data: {
        status: "PAUSED",
        pausedAt: new Date(),
        pauseReason: reason ?? null,
      },
    });

    return NextResponse.json({ deployment: updatedDeployment });
  } catch (error) {
    console.error("Failed to pause deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
