import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import db from "@/lib/db";
import { DEFAULT_CREDIT_POLICY } from "@/lib/credits/types";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId } = parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      policy: DEFAULT_CREDIT_POLICY,
      source: "default",
      configurable: false,
      message: "Workspace-specific credit policy persistence is not implemented yet.",
    });
  } catch (error) {
    console.error("Failed to get credit policies:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = z
      .object({ workspaceId: z.string().min(1) })
      .safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: parsed.data.workspaceId,
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Only owners and admins can manage credit policies" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Workspace-specific credit policy persistence is not implemented yet." },
      { status: 501 },
    );
  } catch (error) {
    console.error("Failed to create credit policy:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
