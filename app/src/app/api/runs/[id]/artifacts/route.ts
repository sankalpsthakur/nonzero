import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const createArtifactSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["EQUITY_CURVE", "REPORT", "NOTEBOOK", "PARQUET", "CHART", "CODE_SNAPSHOT"]),
  url: z.string().url("Must be a valid URL"),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: runId } = await params;
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
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
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
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

    const { name, type, url, sizeBytes } = parsed.data;

    const artifact = await db.runArtifact.create({
      data: {
        runId,
        name,
        type,
        url,
        sizeBytes: sizeBytes ?? null,
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
