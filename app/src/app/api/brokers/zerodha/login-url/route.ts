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
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Find broker account for workspace
    const brokerAccount = await db.brokerAccount.findFirst({
      where: {
        workspaceId,
        broker: "ZERODHA",
      },
    });

    if (!brokerAccount) {
      return NextResponse.json(
        { error: "No Zerodha broker account configured for this workspace" },
        { status: 404 }
      );
    }

    const apiKey = brokerAccount.apiKey;
    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;

    return NextResponse.json({ loginUrl, apiKey });
  } catch (error) {
    console.error("Failed to generate login URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
