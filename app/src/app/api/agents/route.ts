import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { requireWorkspaceMembership } from "@/lib/auth";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  kind: z
    .enum([
      "RESEARCH_DIRECTOR",
      "SWARM_ORCHESTRATOR",
      "STRATEGY_GENERATOR",
      "BACKTEST_RUNNER",
      "CRITIC",
      "DEPLOYMENT",
      "BROKER",
      "RISK_GUARDIAN",
      "RECONCILIATION",
    ])
    .optional(),
  status: z.enum(["IDLE", "ACTIVE", "ERROR"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createAgentSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  kind: z.enum([
    "RESEARCH_DIRECTOR",
    "SWARM_ORCHESTRATOR",
    "STRATEGY_GENERATOR",
    "BACKTEST_RUNNER",
    "CRITIC",
    "DEPLOYMENT",
    "BROKER",
    "RISK_GUARDIAN",
    "RECONCILIATION",
  ]),
  mandate: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      kind: searchParams.get("kind") ?? undefined,
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

    const { workspaceId, kind, status, limit, offset } = parsed.data;
    const auth = await requireWorkspaceMembership(req, workspaceId);
    if (!auth) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where = {
      workspaceId,
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
    };

    const [agents, total] = await Promise.all([
      db.agentProfile.findMany({
        where,
        include: {
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.agentProfile.count({ where }),
    ]);

    return NextResponse.json({
      agents,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list agents:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, name, kind, mandate } = parsed.data;
    const auth = await requireWorkspaceMembership(req, workspaceId);
    if (!auth) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const agent = await db.agentProfile.create({
      data: {
        workspaceId,
        name,
        kind,
        mandate: mandate ?? null,
        status: "IDLE",
      },
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Failed to create agent:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
