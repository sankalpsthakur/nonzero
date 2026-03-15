import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const createArtifactSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  url: z.string().url("Must be a valid URL"),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: runId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify run exists and user has access
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
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const artifacts = await db.runArtifact.findMany({
      where: { runId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ artifacts });
  } catch (error) {
    console.error("Failed to list artifacts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: runId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify run exists
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
      where: {
        workspaceId: run.experiment.family.workspaceId,
        userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createArtifactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, type, url, sizeBytes, metadata } = parsed.data;

    const artifact = await db.runArtifact.create({
      data: {
        runId,
        experimentId: run.experimentId,
        name,
        type,
        url,
        sizeBytes: sizeBytes ?? null,
        metadata: metadata ?? {},
      },
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    console.error("Failed to register artifact:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
