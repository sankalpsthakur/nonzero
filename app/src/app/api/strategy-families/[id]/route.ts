import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const family = await db.strategyFamily.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            status: true,
            metrics: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            experiments: true,
            swarms: true,
          },
        },
      },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      family: {
        ...family,
        summary: {
          totalVersions: family.versions.length,
          latestVersion: family.versions[0] ?? null,
          totalExperiments: family._count.experiments,
          totalSwarms: family._count.swarms,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get strategy family:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
