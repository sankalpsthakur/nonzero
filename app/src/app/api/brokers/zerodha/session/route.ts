import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const querySchema = z.object({
  workspaceId: z.string().min(1, "workspaceId is required"),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Find broker account
    const brokerAccount = await db.brokerAccount.findFirst({
      where: { workspaceId, broker: "ZERODHA" },
    });

    if (!brokerAccount) {
      return NextResponse.json(
        { error: "No Zerodha broker account configured for this workspace" },
        { status: 404 }
      );
    }

    // Find active session
    const session = await db.brokerSession.findFirst({
      where: { brokerAccountId: brokerAccount.id },
      orderBy: { loginTime: "desc" },
    });

    if (!session) {
      return NextResponse.json({
        active: false,
        needsRefresh: true,
        message: "No broker session found. Please log in.",
      });
    }

    const now = new Date();
    const isExpired = session.expiresAt < now;
    const isActive = session.status === "ACTIVE" && !isExpired;

    // Calculate time remaining
    const timeRemainingMs = isActive
      ? session.expiresAt.getTime() - now.getTime()
      : 0;
    const timeRemainingMinutes = Math.max(
      0,
      Math.floor(timeRemainingMs / 60000)
    );

    return NextResponse.json({
      active: isActive,
      needsRefresh: !isActive,
      sessionId: session.id,
      status: isExpired ? "EXPIRED" : session.status,
      loginTime: session.loginTime,
      expiresAt: session.expiresAt,
      timeRemainingMinutes,
      message: isActive
        ? `Session active, expires in ${timeRemainingMinutes} minutes`
        : "Session expired. Please log in again.",
    });
  } catch (error) {
    console.error("Failed to get broker session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
