import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";
import { createSandbox as createModalSandbox } from "@/lib/modal/client";
import type { SandboxConfig, SandboxTags } from "@/lib/modal/types";

const launchSchema = z.object({
  familyId: z.string().min(1, "familyId is required"),
  hypothesis: z.string().min(1).max(2000),
  environment: z
    .enum(["RESEARCH", "PAPER", "SHADOW_LIVE", "LIVE"])
    .default("RESEARCH"),
  evaluator: z.enum(["hyperspace", "india", "custom"]),
  /** Optional experiment ID. If omitted, a new experiment is created. */
  experimentId: z.string().optional(),
  /** Additional configuration forwarded to the sandbox. */
  config: z.record(z.unknown()).optional(),
  /** Max wall-clock seconds (default 1 hour). */
  timeoutSeconds: z.number().int().positive().default(3600),
});

// ---------------------------------------------------------------------------
// POST /api/research/launch — Quick-launch a research run
// ---------------------------------------------------------------------------

/**
 * Quick-launch a research run with minimal boilerplate.
 *
 * Creates an experiment (if not provided), a run, its initial attempt,
 * and a Modal sandbox in a single request. Returns the run info together
 * with the sandbox streaming URL so the caller can begin tailing logs
 * immediately.
 *
 * Body:
 * ```json
 * {
 *   "familyId": "<strategy-family-id>",
 *   "hypothesis": "Adding momentum filter improves Sharpe",
 *   "environment": "RESEARCH",
 *   "evaluator": "hyperspace" | "india" | "custom",
 *   "experimentId": "<optional existing experiment>",
 *   "config": { ... },
 *   "timeoutSeconds": 3600
 * }
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = launchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      familyId,
      hypothesis,
      environment,
      evaluator,
      experimentId: existingExperimentId,
      config,
      timeoutSeconds,
    } = parsed.data;

    // Verify family exists and user has access
    const family = await db.strategyFamily.findUnique({
      where: { id: familyId },
      select: {
        id: true,
        slug: true,
        name: true,
        workspaceId: true,
        workspace: { select: { slug: true } },
      },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: family.workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // If an existing experiment ID was provided, verify it belongs to the family
    if (existingExperimentId) {
      const existing = await db.experiment.findFirst({
        where: { id: existingExperimentId, familyId },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Experiment not found in this family" },
          { status: 404 },
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Create or reuse experiment
      let experimentId = existingExperimentId;

      if (!experimentId) {
        const experiment = await tx.experiment.create({
          data: {
            familyId,
            workspaceId: family.workspaceId,
            name: `Quick research: ${hypothesis.slice(0, 80)}`,
            hypothesis,
            description: `Auto-created for quick research launch using ${evaluator} evaluator`,
          },
        });
        experimentId = experiment.id;
      }

      // Create the run
      const run = await tx.run.create({
        data: {
          experimentId,
          workspaceId: family.workspaceId,
          environment,
          status: "PENDING",
          hypothesis,
          config: {
            evaluator,
            ...(config ?? {}),
          },
        },
      });

      // Create the first attempt
      const attempt = await tx.runAttempt.create({
        data: {
          runId: run.id,
          attemptNumber: 1,
          status: "PENDING",
          startedAt: new Date(),
        },
      });

      return { experimentId, run, attempt };
    });

    // Build sandbox config based on evaluator
    const envMap: Record<string, "research" | "paper" | "shadow-live" | "live"> = {
      RESEARCH: "research",
      PAPER: "paper",
      SHADOW_LIVE: "shadow-live",
      LIVE: "live",
    };

    const sandboxName = `run-${result.run.id}-${result.attempt.id}`;
    const tags: SandboxTags = {
      project: "nonzero",
      workspace: family.workspace.slug,
      env: envMap[environment],
      family: family.slug,
    };

    const evaluatorCommands: Record<string, string[]> = {
      hyperspace: ["python", "-m", "hyperspace.autoquant", "run"],
      india: ["python", "-m", "india_eval.runner", "evaluate"],
      custom: ["python", "run.py"],
    };

    const evaluatorImages: Record<string, string> = {
      hyperspace: "python:3.10-slim",
      india: "python:3.10-slim",
      custom: "python:3.10-slim",
    };

    const sandboxConfig: SandboxConfig = {
      name: sandboxName,
      tags,
      image: {
        baseImage: evaluatorImages[evaluator],
        pipPackages: [],
        aptPackages: [],
        copyCommands: [],
      },
      command: evaluatorCommands[evaluator],
      timeoutSeconds,
      envVars: {
        NONZERO_RUN_ID: result.run.id,
        NONZERO_EXPERIMENT_ID: result.experimentId,
        NONZERO_FAMILY_ID: familyId,
        NONZERO_EVALUATOR: evaluator,
      },
    };

    // Create sandbox via Modal
    const sandboxInfo = await createModalSandbox(sandboxConfig);

    // Persist sandbox info on run
    await db.run.update({
      where: { id: result.run.id },
      data: {
        sandboxId: sandboxInfo.sandboxId,
        sandboxName,
      },
    });

    const logsUrl = `/api/sandboxes/${sandboxInfo.sandboxId}/logs`;

    return NextResponse.json(
      {
        run: {
          id: result.run.id,
          experimentId: result.experimentId,
          environment,
          status: "PENDING",
          hypothesis,
          evaluator,
        },
        sandbox: {
          id: sandboxInfo.sandboxId,
          name: sandboxName,
          status: sandboxInfo.status,
          logsUrl,
        },
        attempt: {
          id: result.attempt.id,
          number: result.attempt.attemptNumber,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to launch research run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
