import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspaceMembership } from "@/lib/auth";

const killSwitchSchema = z.object({
  workspaceId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = killSwitchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, reason } = parsed.data;
    const auth = await requireWorkspaceMembership(req, workspaceId, ["OWNER", "ADMIN"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Only owners and admins can trigger the kill switch" },
        { status: 403 },
      );
    }

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
        return { pausedCount: 0, incidentId: null, deploymentIds: [] as string[] };
      }

      await tx.deployment.updateMany({
        where: { id: { in: activeDeployments.map((deployment) => deployment.id) } },
        data: {
          status: "PAUSED",
        },
      });

      const incident = await tx.incident.create({
        data: {
          workspaceId,
          type: "RISK_BREACH",
          status: "OPEN",
          description: `Kill switch activated: ${reason}. Deployment records paused. Broker-side order cancellation still requires execution integration.`,
        },
      });

      return {
        pausedCount: activeDeployments.length,
        incidentId: incident.id,
        deploymentIds: activeDeployments.map((deployment) => deployment.id),
      };
    });

    return NextResponse.json({
      message:
        result.pausedCount > 0
          ? "Kill switch activated. Deployment records paused; broker-side cancellation is not yet integrated."
          : "Kill switch activated. No active live deployments were found.",
      pausedCount: result.pausedCount,
      incidentId: result.incidentId,
      deploymentIds: result.deploymentIds,
    });
  } catch (error) {
    console.error("Failed to activate kill switch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
