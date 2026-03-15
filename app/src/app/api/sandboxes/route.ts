import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import type {
  SandboxConfig,
  SandboxTags,
  SandboxInfo,
  SandboxFilters,
  SandboxStatus,
} from "@/lib/modal/types";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  environment: z
    .enum(["research", "paper", "shadow-live", "live"])
    .optional(),
  swarmId: z.string().optional(),
  status: z
    .enum(["creating", "running", "completed", "failed", "terminated", "timeout"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createSandboxSchema = z.object({
  runId: z.string().min(1, "runId is required"),
  attemptId: z.string().min(1, "attemptId is required"),
  workspaceSlug: z.string().min(1),
  env: z.enum(["research", "paper", "shadow-live", "live"]),
  swarmId: z.string().optional(),
  familySlug: z.string().optional(),
  strategy: z.string().optional(),
  agentId: z.string().optional(),
  image: z.object({
    baseImage: z.string().min(1),
    pipPackages: z.array(z.string()).default([]),
    aptPackages: z.array(z.string()).default([]),
    copyCommands: z
      .array(z.object({ src: z.string(), dst: z.string() }))
      .default([]),
    envVars: z.record(z.string()).optional(),
  }),
  command: z.array(z.string()).min(1),
  timeoutSeconds: z.number().int().positive().default(3600),
  envVars: z.record(z.string()).optional(),
  cpu: z.number().positive().optional(),
  memoryMiB: z.number().int().positive().optional(),
  gpu: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Stub: Modal client
// ---------------------------------------------------------------------------

/**
 * Calls the Modal API to create a new sandbox.
 *
 * In production this will invoke the Modal Python SDK (or REST API)
 * to spin up an isolated container. For now it returns a placeholder
 * so the control-plane data path can be exercised end-to-end.
 */
async function modalCreateSandbox(config: SandboxConfig): Promise<SandboxInfo> {
  // TODO: replace with actual Modal SDK call
  const sandboxId = `sbx_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  return {
    sandboxId,
    name: config.name,
    status: "creating",
    tags: config.tags as unknown as Record<string, string>,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Calls the Modal API to list sandboxes matching the given filters.
 */
async function modalListSandboxes(
  filters: SandboxFilters,
): Promise<SandboxInfo[]> {
  // TODO: replace with actual Modal SDK call
  void filters;
  return [];
}

// ---------------------------------------------------------------------------
// GET /api/sandboxes — List active sandboxes
// ---------------------------------------------------------------------------

/**
 * List active sandboxes with optional filters for workspace, environment,
 * swarm, and status. Returns sandbox metadata from both the local DB
 * (runs table) and the Modal API.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      environment: searchParams.get("environment") ?? undefined,
      swarmId: searchParams.get("swarmId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, environment, swarmId, status, limit, offset } =
      parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build tag-based filter for the Modal API
    const tagFilters: Partial<SandboxTags> = {
      project: "nonzero",
      workspace: workspaceId,
    };
    if (environment) tagFilters.env = environment;
    if (swarmId) tagFilters.swarm = swarmId;

    const filters: SandboxFilters = { tags: tagFilters };
    if (status) filters.status = status as SandboxStatus;

    // Query Modal API for matching sandboxes
    const sandboxes = await modalListSandboxes(filters);

    // Also query the local DB for runs that have sandboxIds, so the caller
    // can correlate sandbox <-> run.
    const where: Record<string, unknown> = {
      workspaceId,
      sandboxId: { not: null },
    };
    if (environment) {
      const envMap: Record<string, string> = {
        research: "RESEARCH",
        paper: "PAPER",
        "shadow-live": "SHADOW_LIVE",
        live: "LIVE",
      };
      where.environment = envMap[environment];
    }
    if (status) {
      const statusMap: Record<string, string> = {
        creating: "PENDING",
        running: "RUNNING",
        completed: "COMPLETED",
        failed: "FAILED",
        terminated: "STOPPED",
        timeout: "FAILED",
      };
      where.status = statusMap[status];
    }

    const [runs, total] = await Promise.all([
      db.run.findMany({
        where,
        select: {
          id: true,
          sandboxId: true,
          sandboxName: true,
          status: true,
          environment: true,
          createdAt: true,
          startedAt: true,
          experiment: {
            select: {
              id: true,
              name: true,
              family: { select: { id: true, slug: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.run.count({ where }),
    ]);

    return NextResponse.json({
      sandboxes,
      runs,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list sandboxes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/sandboxes — Create a new sandbox
// ---------------------------------------------------------------------------

/**
 * Create a new Modal sandbox for a run attempt.
 *
 * The sandbox is named `run-{runId}-{attemptId}` and tagged with the
 * standard nonzero metadata (project, workspace, env, swarm, family,
 * strategy, agent) so it can be filtered and attributed correctly.
 *
 * Returns the sandbox ID and connection info.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSandboxSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      runId,
      attemptId,
      workspaceSlug,
      env,
      swarmId,
      familySlug,
      strategy,
      agentId,
      image,
      command,
      timeoutSeconds,
      envVars,
      cpu,
      memoryMiB,
      gpu,
    } = parsed.data;

    // Verify the run exists and the user has access
    const run = await db.run.findUnique({
      where: { id: runId },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: run.experiment.family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build sandbox configuration
    const sandboxName = `run-${runId}-${attemptId}`;

    const tags: SandboxTags = {
      project: "nonzero",
      workspace: workspaceSlug,
      env,
      ...(swarmId && { swarm: swarmId }),
      ...(familySlug && { family: familySlug }),
      ...(strategy && { strategy }),
      ...(agentId && { agent: agentId }),
    };

    const config: SandboxConfig = {
      name: sandboxName,
      tags,
      image,
      command,
      timeoutSeconds,
      envVars,
      cpu,
      memoryMiB,
      gpu,
    };

    // Create sandbox via Modal API
    const sandboxInfo = await modalCreateSandbox(config);

    // Persist sandbox ID on the run record
    await db.run.update({
      where: { id: runId },
      data: {
        sandboxId: sandboxInfo.sandboxId,
        sandboxName,
      },
    });

    return NextResponse.json(
      {
        sandbox: sandboxInfo,
        runId,
        attemptId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create sandbox:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
