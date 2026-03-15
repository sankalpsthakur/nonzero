import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const killSwitchSchema = z.object({
  workspaceId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = killSwitchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, reason } = parsed.data;

    // Verify membership (only OWNER or ADMIN can trigger kill switch)
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can trigger the kill switch" },
        { status: 403 }
      );
    }

    // Pause ALL active live deployments in a transaction
    const result = await db.$transaction(async (tx) => {
      const activeDeployments = await tx.deployment.findMany({
        where: {
          workspaceId,
          environment: "LIVE",
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (activeDeployments.length === 0) {
        return { pausedCount: 0, incidentId: null, deploymentIds: [] };
      }

      const pausedAt = new Date();

      await tx.deployment.updateMany({
        where: {
          id: { in: activeDeployments.map((d) => d.id) },
        },
        data: {
          status: "PAUSED",
          pausedAt,
          pauseReason: `Kill switch: ${reason}`,
        },
      });

      // Create an incident record for the kill switch activation
      const incident = await tx.incident.create({
        data: {
          workspaceId,
          type: "RISK_BREACH",
          status: "OPEN",
          description: `Kill switch activated: ${reason}. Paused ${activeDeployments.length} live deployment(s).`,
        },
      });

      return {
        pausedCount: activeDeployments.length,
        incidentId: incident.id,
        deploymentIds: activeDeployments.map((d) => d.id),
      };
    });

    return NextResponse.json({
      message: `Kill switch activated. ${result.pausedCount} live deployment(s) paused.`,
      pausedCount: result.pausedCount,
      incidentId: result.incidentId,
      deploymentIds: result.deploymentIds,
    });
  } catch (error) {
    console.error("Failed to activate kill switch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
