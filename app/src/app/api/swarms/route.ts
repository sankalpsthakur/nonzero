import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z
    .enum(["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createSwarmSchema = z.object({
  workspaceId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  familyId: z.string().min(1),
  name: z.string().min(1).max(200),
  objective: z.string().min(1).max(2000),
  maxConcurrency: z.number().int().min(1).max(100).default(5),
  config: z.record(z.unknown()).optional(),
  creditBudget: z.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status, limit, offset } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: Record<string, unknown> = { workspaceId };
    if (status) where.status = status;

    const [swarms, total] = await Promise.all([
      db.swarm.findMany({
        where,
        include: {
          family: { select: { id: true, name: true } },
          _count: { select: { children: true } },
          creditReservation: {
            select: { id: true, amount: true, consumed: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.swarm.count({ where }),
    ]);

    return NextResponse.json({
      swarms,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list swarms:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSwarmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      workspaceId,
      templateId,
      familyId,
      name,
      objective,
      maxConcurrency,
      config,
      creditBudget,
    } = parsed.data;

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify family belongs to workspace
    const family = await db.strategyFamily.findFirst({
      where: { id: familyId, workspaceId },
    });
    if (!family) {
      return NextResponse.json(
        { error: "Strategy family not found in this workspace" },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      // Create credit reservation if budget specified
      let reservation = null;
      if (creditBudget) {
        // Find the TESTING credit account
        const account = await tx.creditAccount.findFirst({
          where: { workspaceId, type: "TESTING" },
        });

        if (!account) {
          throw new Error("No TESTING credit account found");
        }

        if (account.balance < creditBudget) {
          throw new Error(
            `Insufficient credits. Available: ${account.balance}, Requested: ${creditBudget}`
          );
        }

        // Reserve credits
        reservation = await tx.creditReservation.create({
          data: {
            accountId: account.id,
            amount: creditBudget,
            consumed: 0,
            status: "ACTIVE",
            reservedById: userId,
          },
        });

        // Deduct from available balance
        await tx.creditAccount.update({
          where: { id: account.id },
          data: { balance: { decrement: creditBudget } },
        });
      }

      const swarm = await tx.swarm.create({
        data: {
          workspaceId,
          templateId: templateId ?? null,
          familyId,
          name,
          objective,
          maxConcurrency,
          config: config ?? {},
          status: "PENDING",
          createdById: userId,
          creditReservationId: reservation?.id ?? null,
        },
        include: {
          family: { select: { id: true, name: true } },
          creditReservation: true,
        },
      });

      return swarm;
    });

    return NextResponse.json({ swarm: result }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const isUserError =
      message.includes("Insufficient credits") ||
      message.includes("No TESTING credit account");

    console.error("Failed to create swarm:", error);
    return NextResponse.json(
      { error: isUserError ? message : "Internal server error" },
      { status: isUserError ? 400 : 500 }
    );
  }
}
