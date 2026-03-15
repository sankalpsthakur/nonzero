import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: id, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 },
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id },
      include: {
        _count: { select: { memberships: true } },
        creditAccounts: {
          select: {
            id: true,
            bucket: true,
            balance: true,
            reservedBalance: true,
          },
        },
        onboardingChecklist: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({
      workspace: {
        ...workspace,
        memberCount: workspace._count.memberships,
        currentUserRole: membership.role,
      },
    });
  } catch (error) {
    console.error("Failed to get workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
