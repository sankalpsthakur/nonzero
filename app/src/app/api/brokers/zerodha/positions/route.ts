import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getPositions } from "@/lib/kite";

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

    // Find broker account and active session
    const brokerAccount = await db.brokerAccount.findFirst({
      where: { workspaceId, broker: "ZERODHA" },
      include: {
        sessions: {
          where: { status: "ACTIVE" },
          orderBy: { loginTime: "desc" },
          take: 1,
        },
      },
    });

    if (!brokerAccount) {
      return NextResponse.json(
        { error: "No Zerodha broker account configured" },
        { status: 404 }
      );
    }

    const session = brokerAccount.sessions[0];
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "No active broker session. Please log in." },
        { status: 401 }
      );
    }

    // Fetch positions from Kite API
    const positions = await getPositions(
      session.accessToken,
      brokerAccount.apiKey
    );

    // Store snapshot
    const snapshot = await db.positionSnapshot.create({
      data: {
        brokerAccountId: brokerAccount.id,
        workspaceId,
        snapshotTime: new Date(),
        positions: positions as unknown as Record<string, unknown>,
        netCount: positions.net?.length ?? 0,
        dayCount: positions.day?.length ?? 0,
      },
    });

    return NextResponse.json({
      positions,
      snapshot: {
        id: snapshot.id,
        snapshotTime: snapshot.snapshotTime,
        netCount: snapshot.netCount,
        dayCount: snapshot.dayCount,
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
