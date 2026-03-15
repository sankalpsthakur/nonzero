import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

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

    if (deployment.status !== "PAUSED") {
      return NextResponse.json(
        {
          error: `Cannot resume a deployment with status '${deployment.status}'. Only PAUSED deployments can be resumed.`,
        },
        { status: 409 }
      );
    }

    const updatedDeployment = await db.deployment.update({
      where: { id },
      data: {
        status: "ACTIVE",
        pausedAt: null,
        pauseReason: null,
        resumedAt: new Date(),
      },
    });

    return NextResponse.json({ deployment: updatedDeployment });
  } catch (error) {
    console.error("Failed to resume deployment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
