import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const getQuerySchema = z.object({
  familyId: z.string().min(1, "familyId is required"),
  topN: z.coerce.number().min(1).max(100).default(10),
});

const submitCandidateSchema = z.object({
  familyId: z.string().min(1, "familyId is required"),
  runId: z.string().min(1),
  /** Version/generation number for this candidate. */
  version: z.number().int().positive(),
  /** Code snapshot content. */
  codeSnapshot: z.string().min(1),
  /** Configuration snapshot. */
  configSnapshot: z.record(z.unknown()).optional(),
  /** Strategy metrics from evaluation. */
  metrics: z.object({
    totalReturn: z.number(),
    alpha: z.number(),
    sharpe: z.number(),
    sortino: z.number(),
    maxDrawdown: z.number(),
    winRate: z.number(),
    profitFactor: z.number(),
    tradeCount: z.number().int(),
    inSampleSharpe: z.number().optional(),
    outOfSampleSharpe: z.number().optional(),
    backtestDays: z.number().int().optional(),
    paperDays: z.number().int().optional(),
    parameterSensitivity: z.number().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Computes the composite frontier score for a strategy candidate.
 *
 * Formula:
 *   totalReturn * 1000 + alpha * 100 + sharpe * 10 + sortino * 5
 *   - maxDrawdown * 1000
 */
function computeCompositeScore(metrics: {
  totalReturn: number;
  alpha: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
}): number {
  return (
    metrics.totalReturn * 1000 +
    metrics.alpha * 100 +
    metrics.sharpe * 10 +
    metrics.sortino * 5 -
    metrics.maxDrawdown * 1000
  );
}

// ---------------------------------------------------------------------------
// GET /api/research/frontier — Get current frontier for a family
// ---------------------------------------------------------------------------

/**
 * Returns the top N strategy candidates for a given family, ordered by
 * composite score descending. Each candidate includes its metrics and
 * the associated strategy version data.
 *
 * Query params:
 *   - `familyId` (required) — the strategy family to query.
 *   - `topN` (optional, default 10) — number of top candidates to return.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = getQuerySchema.safeParse({
      familyId: searchParams.get("familyId"),
      topN: searchParams.get("topN") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { familyId, topN } = parsed.data;

    // Verify family exists and user has access
    const family = await db.strategyFamily.findUnique({
      where: { id: familyId },
      select: { workspaceId: true, name: true, slug: true },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch strategy versions with metrics, ordered by version desc
    // (most recent candidates first), then we score and rank them.
    const versions = await db.strategyVersion.findMany({
      where: {
        familyId,
        metrics: { not: null },
      },
      orderBy: { version: "desc" },
      take: topN * 3, // over-fetch to ensure we have enough scored candidates
    });

    // Score and rank
    const scored = versions
      .map((v) => {
        const m = v.metrics as Record<string, number> | null;
        if (!m || m.totalReturn === undefined) return null;

        const compositeScore = computeCompositeScore({
          totalReturn: m.totalReturn ?? 0,
          alpha: m.alpha ?? 0,
          sharpe: m.sharpe ?? 0,
          sortino: m.sortino ?? 0,
          maxDrawdown: m.maxDrawdown ?? 0,
        });

        return {
          id: v.id,
          version: v.version,
          status: v.status,
          metrics: m,
          compositeScore,
          createdAt: v.createdAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.compositeScore - a!.compositeScore)
      .slice(0, topN);

    return NextResponse.json({
      familyId,
      familyName: family.name,
      frontier: scored,
      count: scored.length,
    });
  } catch (error) {
    console.error("Failed to get frontier:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/research/frontier — Submit a new candidate to the frontier
// ---------------------------------------------------------------------------

/**
 * Submits a new strategy candidate to the frontier. This creates (or
 * updates) a StrategyVersion record with the supplied code snapshot,
 * config, and metrics, then returns the candidate's rank within the
 * current frontier.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = submitCandidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { familyId, runId, version, codeSnapshot, configSnapshot, metrics } =
      parsed.data;

    // Verify family exists and user has access
    const family = await db.strategyFamily.findUnique({
      where: { id: familyId },
      select: { workspaceId: true },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: family.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify run exists
    const run = await db.run.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const compositeScore = computeCompositeScore(metrics);

    // Create or update the strategy version
    const strategyVersion = await db.strategyVersion.upsert({
      where: {
        familyId_version: { familyId, version },
      },
      create: {
        familyId,
        version,
        codeSnapshot,
        configSnapshot: configSnapshot ?? {},
        metrics: { ...metrics, compositeScore },
        status: "TESTING",
      },
      update: {
        codeSnapshot,
        configSnapshot: configSnapshot ?? {},
        metrics: { ...metrics, compositeScore },
      },
    });

    // Record a run event for traceability
    await db.runEvent.create({
      data: {
        runId,
        type: "METRIC",
        payload: {
          action: "frontier_submission",
          strategyVersionId: strategyVersion.id,
          compositeScore,
          metrics,
        },
      },
    });

    // Determine rank: count how many versions in this family have a higher score
    const allVersions = await db.strategyVersion.findMany({
      where: { familyId, metrics: { not: null } },
      select: { id: true, metrics: true },
    });

    const rank =
      allVersions.filter((v) => {
        const m = v.metrics as Record<string, number> | null;
        if (!m) return false;
        const s = computeCompositeScore({
          totalReturn: m.totalReturn ?? 0,
          alpha: m.alpha ?? 0,
          sharpe: m.sharpe ?? 0,
          sortino: m.sortino ?? 0,
          maxDrawdown: m.maxDrawdown ?? 0,
        });
        return s > compositeScore;
      }).length + 1;

    return NextResponse.json(
      {
        candidate: {
          id: strategyVersion.id,
          familyId,
          version,
          compositeScore,
          rank,
          metrics,
        },
        totalCandidates: allVersions.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to submit frontier candidate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
