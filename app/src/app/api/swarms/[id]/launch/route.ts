import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import type { SwarmSession, ChildConfig } from "@/lib/swarm/types";

type RouteParams = { params: Promise<{ id: string }> };

const launchSchema = z.object({
  /** Initial batch of children to spawn. */
  children: z
    .array(
      z.object({
        hypothesis: z.string().min(1),
        experimentId: z.string().min(1),
        environment: z
          .enum(["RESEARCH", "PAPER", "SHADOW_LIVE", "LIVE"])
          .default("RESEARCH"),
        runConfig: z.record(z.unknown()).optional(),
        label: z.string().optional(),
      }),
    )
    .min(1, "At least one child is required to launch a swarm")
    .max(100),
  /** Override credit budget (falls back to template default). */
  creditBudget: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/swarms/[id]/launch — Launch a swarm
// ---------------------------------------------------------------------------

/**
 * Launches a swarm that was previously created in PENDING status.
 *
 * This endpoint:
 *  1. Validates that the swarm exists and is PENDING.
 *  2. Creates a credit reservation (if budget specified or template default).
 *  3. Transitions the swarm to RUNNING.
 *  4. Spawns the initial batch of child runs with their own sandbox names.
 *  5. Returns the updated swarm session info.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: swarmId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the swarm with template info
    const swarm = await db.swarm.findUnique({
      where: { id: swarmId },
      include: {
        template: true,
        family: { select: { id: true, slug: true, workspaceId: true } },
      },
    });

    if (!swarm) {
      return NextResponse.json({ error: "Swarm not found" }, { status: 404 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: swarm.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Only PENDING swarms can be launched
    if (swarm.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Cannot launch a swarm with status '${swarm.status}'. Only PENDING swarms can be launched.`,
        },
        { status: 409 },
      );
    }

    // Validate body
    const body = await req.json();
    const parsed = launchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { children: childConfigs, creditBudget } = parsed.data;

    // Enforce max concurrency
    if (childConfigs.length > swarm.maxConcurrency) {
      return NextResponse.json(
        {
          error: `Cannot spawn ${childConfigs.length} children. Max concurrency for this swarm is ${swarm.maxConcurrency}.`,
        },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      // Reserve credits
      const budget =
        creditBudget ??
        (swarm.template
          ? Number(swarm.template.defaultCreditCeiling)
          : 0);

      let reservationId: string | null = null;

      if (budget > 0) {
        const account = await tx.creditAccount.findFirst({
          where: { workspaceId: swarm.workspaceId, bucket: "TESTING" },
        });

        if (!account) {
          throw new Error("No TESTING credit account found for this workspace");
        }

        if (Number(account.balance) < budget) {
          throw new Error(
            `Insufficient credits. Available: ${account.balance}, Requested: ${budget}`,
          );
        }

        const reservation = await tx.creditReservation.create({
          data: {
            accountId: account.id,
            amount: budget,
            status: "PENDING",
            swarmId,
          },
        });

        await tx.creditAccount.update({
          where: { id: account.id },
          data: { balance: { decrement: budget } },
        });

        await tx.creditLedgerEntry.create({
          data: {
            accountId: account.id,
            type: "RESERVE",
            amount: budget,
            description: `Swarm launch reservation for ${swarm.name}`,
            referenceType: "SWARM",
            referenceId: swarmId,
          },
        });

        reservationId = reservation.id;
      }

      // Transition swarm to RUNNING
      const updatedSwarm = await tx.swarm.update({
        where: { id: swarmId },
        data: {
          status: "RUNNING",
          creditReservationId: reservationId,
          activeChildCount: childConfigs.length,
        },
      });

      // Spawn children: create Run + SwarmChild for each
      const spawnedChildren = await Promise.all(
        childConfigs.map(async (childCfg: ChildConfig, index: number) => {
          // Create the run
          const run = await tx.run.create({
            data: {
              experimentId: childCfg.experimentId,
              workspaceId: swarm.workspaceId,
              environment: childCfg.environment ?? "RESEARCH",
              status: "PENDING",
              hypothesis: childCfg.hypothesis,
              config: childCfg.runConfig ?? {},
            },
          });

          // Create the initial attempt
          await tx.runAttempt.create({
            data: {
              runId: run.id,
              attemptNumber: 1,
              status: "PENDING",
              startedAt: new Date(),
            },
          });

          // Create the swarm child
          const child = await tx.swarmChild.create({
            data: {
              swarmId,
              runId: run.id,
              status: "PENDING",
              hypothesis: childCfg.hypothesis,
            },
          });

          return {
            childId: child.id,
            runId: run.id,
            hypothesis: childCfg.hypothesis,
            label: childCfg.label ?? `child-${index}`,
            sandboxName: `run-${run.id}-1`,
          };
        }),
      );

      return {
        swarm: updatedSwarm,
        reservationId,
        children: spawnedChildren,
      };
    });

    const session: SwarmSession = {
      id: result.swarm.id,
      workspaceId: result.swarm.workspaceId,
      familyId: result.swarm.familyId,
      templateId: result.swarm.templateId,
      name: result.swarm.name,
      objective: result.swarm.objective,
      status: result.swarm.status,
      maxConcurrency: result.swarm.maxConcurrency,
      activeChildCount: result.swarm.activeChildCount,
      creditReservationId: result.reservationId,
      currentBestCandidateId: result.swarm.currentBestCandidateId,
      failureRate: result.swarm.failureRate,
      createdAt: result.swarm.createdAt,
      updatedAt: result.swarm.updatedAt,
    };

    return NextResponse.json(
      {
        session,
        children: result.children,
        message: `Swarm launched with ${result.children.length} initial children`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const isUserError =
      message.includes("Insufficient credits") ||
      message.includes("No TESTING credit account");

    console.error("Failed to launch swarm:", error);
    return NextResponse.json(
      { error: isUserError ? message : "Internal server error" },
      { status: isUserError ? 400 : 500 },
    );
  }
}
