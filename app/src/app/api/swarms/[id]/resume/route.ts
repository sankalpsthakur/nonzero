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

    const swarm = await db.swarm.findUnique({
      where: { id },
    });

    if (!swarm) {
      return NextResponse.json({ error: "Swarm not found" }, { status: 404 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: swarm.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (swarm.status !== "PAUSED") {
      return NextResponse.json(
        {
          error: `Cannot resume a swarm with status '${swarm.status}'. Only PAUSED swarms can be resumed.`,
        },
        { status: 409 }
      );
    }

    const updatedSwarm = await db.swarm.update({
      where: { id },
      data: {
        status: "RUNNING",
        pausedAt: null,
        resumedAt: new Date(),
      },
    });

    return NextResponse.json({ swarm: updatedSwarm });
  } catch (error) {
    console.error("Failed to resume swarm:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
