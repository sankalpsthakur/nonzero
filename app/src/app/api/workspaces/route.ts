import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  type: z.enum(["SOLO_LAB", "TEAM"]),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memberships = await db.workspaceMembership.findMany({
      where: { userId: auth.userId },
      include: {
        workspace: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const workspaces = memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role,
      joinedAt: membership.createdAt,
      memberCount: membership.workspace._count.memberships,
    }));

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
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

    const body = await req.json();
    const parsed = createWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, slug, type } = parsed.data;

    const existing = await db.workspace.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Workspace slug already taken" },
        { status: 409 },
      );
    }

    const workspace = await db.$transaction(async (tx) => {
      const createdWorkspace = await tx.workspace.create({
        data: { name, slug, type },
      });

      await tx.workspaceMembership.create({
        data: {
          workspaceId: createdWorkspace.id,
          userId: auth.userId,
          role: "OWNER",
        },
      });

      await tx.creditAccount.createMany({
        data: [
          { workspaceId: createdWorkspace.id, bucket: "TESTING", balance: 1000 },
          { workspaceId: createdWorkspace.id, bucket: "LIVE_OPS", balance: 0 },
        ],
      });

      await tx.onboardingChecklist.create({
        data: {
          workspaceId: createdWorkspace.id,
          workspaceCreated: true,
        },
      });

      await tx.riskPolicy.createMany({
        data: [
          {
            workspaceId: createdWorkspace.id,
            name: "Max Capital Allocation",
            type: "MAX_CAPITAL",
            threshold: 10,
          },
          {
            workspaceId: createdWorkspace.id,
            name: "Max Daily Loss",
            type: "MAX_DAILY_LOSS",
            threshold: 5,
          },
          {
            workspaceId: createdWorkspace.id,
            name: "Max Concurrent Positions",
            type: "MAX_CONCURRENT",
            threshold: 20,
          },
        ],
      });

      return createdWorkspace;
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
