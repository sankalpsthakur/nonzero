import { DeploymentStatus, MemberRole } from "@prisma/client";
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

const pauseSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const deployment = await db.deployment.findUnique({
      where: { id },
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
        { error: "Only workspace owners, admins, or traders can pause deployments" },
        { status: 403 },
      );
    }

    if (deployment.status !== DeploymentStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Only active deployments can be paused" },
        { status: 409 },
      );
    }

    const parsed = pauseSchema.safeParse(await req.json().catch(() => ({})));
    const reason = parsed.success ? parsed.data.reason : undefined;

    const updatedDeployment = await db.deployment.update({
      where: { id },
      data: { status: DeploymentStatus.PAUSED },
    });

    return NextResponse.json({
      deployment: updatedDeployment,
      message: reason
        ? `Deployment paused. Reason noted by requester: ${reason}`
        : "Deployment paused",
    });
  } catch (error) {
    console.error("Failed to pause deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
