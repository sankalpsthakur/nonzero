import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getPositions } from "@/lib/kite";
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
        { error: "No Zerodha broker account configured" },
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
      return NextResponse.json(
        { error: "No active broker session. Please log in." },
        { status: 401 },
      );
    }

    if (session.expiresAt < new Date()) {
      await db.brokerSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });

      return NextResponse.json(
        { error: "Broker session expired. Please log in again." },
        { status: 401 },
      );
    }

    const positions = await getPositions(
      session.accessToken,
      brokerAccount.apiKey,
    );

    return NextResponse.json({
      positions,
      snapshot: {
        snapshotAt: new Date().toISOString(),
        netCount: positions.net.length,
        dayCount: positions.day.length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch positions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
