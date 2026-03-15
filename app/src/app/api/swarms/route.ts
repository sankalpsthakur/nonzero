import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z
    .enum(["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED"])
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
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
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
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.swarm.count({ where }),
    ]);

    const reservationIds = swarms
      .map((swarm) => swarm.creditReservationId)
      .filter((id): id is string => Boolean(id));
    const reservations = reservationIds.length
      ? await db.creditReservation.findMany({
          where: { id: { in: reservationIds } },
          select: { id: true, amount: true, status: true },
        })
      : [];
    const reservationById = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );

    return NextResponse.json({
      swarms: swarms.map((swarm) => ({
        ...swarm,
        creditReservation: swarm.creditReservationId
          ? reservationById.get(swarm.creditReservationId) ?? null
          : null,
      })),
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
    const auth = await getAuthFromRequest(req);
    const userId = auth?.userId;
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

    const template =
      templateId
        ? await db.swarmTemplate.findUnique({ where: { id: templateId } })
        : await db.swarmTemplate.findFirst({ orderBy: { createdAt: "asc" } });
    if (!template) {
      return NextResponse.json(
        { error: "No swarm template available" },
        { status: 400 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      const swarm = await tx.swarm.create({
        data: {
          workspaceId,
          templateId: template.id,
          familyId,
          name,
          objective,
          maxConcurrency,
          status: "PENDING",
        },
        include: {
          family: { select: { id: true, name: true } },
        },
      });

      if (!creditBudget) {
        return { swarm, creditReservation: null };
      }

      const account = await tx.creditAccount.findFirst({
        where: { workspaceId, bucket: "TESTING" },
      });
      if (!account) {
        throw new Error("No TESTING credit account found");
      }

      const available = Number(account.balance) - Number(account.reservedBalance);
      if (available < creditBudget) {
        throw new Error(
          `Insufficient credits. Available: ${available}, Requested: ${creditBudget}`,
        );
      }

      const reservation = await tx.creditReservation.create({
        data: {
          accountId: account.id,
          amount: creditBudget,
          status: "PENDING",
          swarmId: swarm.id,
        },
      });

      await tx.creditAccount.update({
        where: { id: account.id },
        data: {
          reservedBalance: { increment: creditBudget },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          accountId: account.id,
          type: "RESERVE",
          amount: creditBudget,
          description: `Swarm reservation for ${name}`,
          referenceType: "swarm",
          referenceId: reservation.id,
        },
      });

      const updatedSwarm = await tx.swarm.update({
        where: { id: swarm.id },
        data: { creditReservationId: reservation.id },
        include: {
          family: { select: { id: true, name: true } },
        },
      });

      return {
        swarm: updatedSwarm,
        creditReservation: reservation,
      };
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
