import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  step: z.enum([
    "workspaceCreated",
    "researchBriefSet",
    "infraConnected",
    "swarmTemplateSelected",
    "validationSwarmRun",
    "livePrereqsUnlocked",
  ]),
  completed: z.boolean(),
});

const STEP_LABELS: Record<
  z.infer<typeof patchSchema>["step"],
  string
> = {
  workspaceCreated: "Workspace Created",
  researchBriefSet: "Research Brief Set",
  infraConnected: "Infrastructure Connected",
  swarmTemplateSelected: "Swarm Template Selected",
  validationSwarmRun: "Validation Swarm Run",
  livePrereqsUnlocked: "Live Prerequisites Unlocked",
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const checklist = await db.onboardingChecklist.findUnique({
      where: { workspaceId },
    });

    if (!checklist) {
      return NextResponse.json(
        { error: "Onboarding checklist not found" },
        { status: 404 },
      );
    }

    const steps = (Object.keys(STEP_LABELS) as Array<keyof typeof STEP_LABELS>).map(
      (key) => ({
        key,
        label: STEP_LABELS[key],
        completed: checklist[key],
      }),
    );

    const completedCount = steps.filter((step) => step.completed).length;

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
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
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
      { status: 500 },
    );
  }
}
