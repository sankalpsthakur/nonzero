import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  step: z.enum([
    "connectBroker",
    "createStrategy",
    "runBacktest",
    "deployPaper",
    "reviewRisk",
  ]),
  completed: z.boolean(),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const checklist = await db.onboardingChecklist.findUnique({
      where: { workspaceId },
    });

    if (!checklist) {
      return NextResponse.json(
        { error: "Onboarding checklist not found" },
        { status: 404 }
      );
    }

    const steps = [
      { key: "connectBroker", label: "Connect Broker", completed: checklist.connectBroker },
      { key: "createStrategy", label: "Create Strategy", completed: checklist.createStrategy },
      { key: "runBacktest", label: "Run Backtest", completed: checklist.runBacktest },
      { key: "deployPaper", label: "Deploy Paper Trade", completed: checklist.deployPaper },
      { key: "reviewRisk", label: "Review Risk Policies", completed: checklist.reviewRisk },
    ];

    const completedCount = steps.filter((s) => s.completed).length;

    return NextResponse.json({
      checklist,
      steps,
      progress: {
        completed: completedCount,
        total: steps.length,
        percentage: Math.round((completedCount / steps.length) * 100),
      },
    });
  } catch (error) {
    console.error("Failed to get onboarding status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { step, completed } = parsed.data;

    const checklist = await db.onboardingChecklist.update({
      where: { workspaceId },
      data: { [step]: completed },
    });

    return NextResponse.json({ checklist });
  } catch (error) {
    console.error("Failed to update onboarding:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
