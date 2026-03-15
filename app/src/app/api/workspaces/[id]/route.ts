import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: id, userId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 404 }
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
        creditAccounts: {
          select: {
            id: true,
            type: true,
            balance: true,
            currency: true,
          },
        },
        onboardingChecklist: true,
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      workspace: {
        ...workspace,
        memberCount: workspace._count.members,
        currentUserRole: membership.role,
      },
    });
  } catch (error) {
    console.error("Failed to get workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
