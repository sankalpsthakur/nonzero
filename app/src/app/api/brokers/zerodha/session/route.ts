import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import {
  findAccessibleBrokerAccount,
  getAuthenticatedUserId,
} from "../_auth";

const querySchema = z.object({
  workspaceId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
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

    const lookup = await findAccessibleBrokerAccount(userId, workspaceId);
    if (lookup.kind === "forbidden") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (lookup.kind === "ambiguous") {
      return NextResponse.json(
        { error: "workspaceId is required when multiple broker accounts are accessible" },
        { status: 400 },
      );
    }
    if (lookup.kind === "missing") {
      return NextResponse.json(
        { error: "No Zerodha broker account configured for this workspace" },
        { status: 404 },
      );
    }

    const { brokerAccount } = lookup;

    const session = await db.brokerSession.findFirst({
      where: {
        brokerAccountId: brokerAccount.id,
        isActive: true,
      },
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
    if (isExpired && session.isActive) {
      await db.brokerSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });
    }
    const isActive = session.isActive && !isExpired;

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
      status: isExpired ? "EXPIRED" : "ACTIVE",
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
