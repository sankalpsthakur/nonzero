import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const createArtifactSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "EQUITY_CURVE",
    "REPORT",
    "NOTEBOOK",
    "PARQUET",
    "CHART",
    "CODE_SNAPSHOT",
  ]),
  url: z.string().url("Must be a valid URL"),
  sizeBytes: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/sandboxes/[id]/artifacts — List sandbox artifacts
// ---------------------------------------------------------------------------

/**
 * Lists all artifacts produced by the run associated with the given
 * sandbox. Artifacts are files (equity curves, reports, notebooks, etc.)
 * that have been uploaded from the sandbox to object storage.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: sandboxId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the run by its sandboxId
    const run = await db.run.findFirst({
      where: { sandboxId },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Sandbox not found or not associated with any run" },
        { status: 404 },
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const artifacts = await db.runArtifact.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ sandboxId, runId: run.id, artifacts });
  } catch (error) {
    console.error("Failed to list sandbox artifacts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/sandboxes/[id]/artifacts — Upload/register artifact
// ---------------------------------------------------------------------------

/**
 * Registers a new artifact produced by a sandbox. The actual file should
 * already have been uploaded to object storage; this endpoint records the
 * metadata (name, type, URL, size) in the control plane database.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: sandboxId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the run by its sandboxId
    const run = await db.run.findFirst({
      where: { sandboxId },
      include: {
        experiment: {
          select: { family: { select: { workspaceId: true } } },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Sandbox not found or not associated with any run" },
        { status: 404 },
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Validate body
    const body = await req.json();
    const parsed = createArtifactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, type, url, sizeBytes } = parsed.data;

    const artifact = await db.runArtifact.create({
      data: {
        runId: run.id,
        name,
        type,
        url,
        sizeBytes: sizeBytes ?? null,
      },
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    console.error("Failed to register sandbox artifact:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
