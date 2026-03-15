import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

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
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memberships = await db.workspaceMembership.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, slug, type } = parsed.data;

    // Check slug uniqueness
    const existing = await db.workspace.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Workspace slug already taken" },
        { status: 409 }
      );
    }

    const workspace = await db.$transaction(async (tx) => {
      // Create workspace
      const ws = await tx.workspace.create({
        data: { name, slug, type, ownerId: userId },
      });

      // Add creator as OWNER member
      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          role: "OWNER",
        },
      });

      // Create default credit accounts (TESTING + LIVE_OPS)
      await tx.creditAccount.createMany({
        data: [
          {
            workspaceId: ws.id,
            type: "TESTING",
            balance: 10000,
            currency: "USD",
          },
          {
            workspaceId: ws.id,
            type: "LIVE_OPS",
            balance: 10000,
            currency: "USD",
          },
        ],
      });

      // Create onboarding checklist
      await tx.onboardingChecklist.create({
        data: {
          workspaceId: ws.id,
          connectBroker: false,
          createStrategy: false,
          runBacktest: false,
          deployPaper: false,
          reviewRisk: false,
        },
      });

      // Create default risk policies
      await tx.riskPolicy.createMany({
        data: [
          {
            workspaceId: ws.id,
            name: "Max Position Size",
            type: "POSITION_LIMIT",
            params: { maxPositionPct: 10 },
            enabled: true,
          },
          {
            workspaceId: ws.id,
            name: "Daily Loss Limit",
            type: "DAILY_LOSS_LIMIT",
            params: { maxDailyLossPct: 5 },
            enabled: true,
          },
          {
            workspaceId: ws.id,
            name: "Max Open Orders",
            type: "ORDER_LIMIT",
            params: { maxOpenOrders: 20 },
            enabled: true,
          },
        ],
      });

      return ws;
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
