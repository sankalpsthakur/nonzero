import { DeploymentStatus, MemberRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const DEPLOYMENT_MUTATION_ROLES: MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.TRADER,
];

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
        { error: "Only workspace owners, admins, or traders can activate deployments" },
        { status: 403 },
      );
    }

    if (
      deployment.status !== DeploymentStatus.PAUSED &&
      deployment.status !== DeploymentStatus.APPROVED
    ) {
      return NextResponse.json(
        {
          error:
            "Only paused or approved deployments can be activated",
        },
        { status: 409 },
      );
    }

    const updatedDeployment = await db.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.ACTIVE,
        activatedAt: deployment.activatedAt ?? new Date(),
      },
    });

    return NextResponse.json({
      deployment: updatedDeployment,
      message:
        deployment.status === DeploymentStatus.APPROVED
          ? "Deployment activated"
          : "Deployment resumed",
    });
  } catch (error) {
    console.error("Failed to resume deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
