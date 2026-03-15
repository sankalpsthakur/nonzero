import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

const createReservationSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  runId: z.string().optional(),
  swarmId: z.string().optional(),
  description: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["ACTIVE", "RELEASED", "CONSUMED", "EXPIRED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
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

    const where: Record<string, unknown> = {
      account: { workspaceId },
    };
    if (status) {
      where.status = status;
    } else {
      where.status = "ACTIVE";
    }

    const [reservations, total] = await Promise.all([
      db.creditReservation.findMany({
        where,
        include: {
          account: { select: { id: true, type: true, currency: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.creditReservation.count({ where }),
    ]);

    // Total reserved amount
    const totalReserved = reservations.reduce(
      (sum, r) => sum + (r.amount - r.consumed),
      0
    );

    return NextResponse.json({
      reservations,
      totalReserved,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list reservations:", error);
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
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { accountId, amount, runId, swarmId, description } = parsed.data;

    // Verify account exists and user has access (pre-check before transaction)
    const account = await db.creditAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Credit account not found" },
        { status: 404 }
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: account.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Balance check and reservation MUST happen inside a serializable
    // transaction to prevent overdraft from concurrent requests.
    const result = await db.$transaction(async (tx) => {
      // Lock the account row by reading it inside the transaction
      const lockedAccount = await tx.creditAccount.findUnique({
        where: { id: accountId },
      });
      if (!lockedAccount) {
        throw new Error("Account not found");
      }

      const available = Number(lockedAccount.balance) - Number(lockedAccount.reservedBalance);
      if (available < amount) {
        throw new Error("Insufficient credits");
      }

      // Create reservation and update balance atomically
      const reservation = await tx.creditReservation.create({
        data: {
          accountId,
          amount,
          consumed: 0,
          status: "ACTIVE",
          reservedById: userId,
          runId: runId ?? null,
          swarmId: swarmId ?? null,
          description: description ?? null,
        },
      });

      await tx.creditAccount.update({
        where: { id: accountId },
        data: { reservedBalance: { increment: amount } },
      });

      // Create ledger entry
      await tx.creditLedgerEntry.create({
        data: {
          accountId,
          type: "RESERVATION",
          amount,
          balance: Number(lockedAccount.balance),
          description: description ?? `Credit reservation`,
          reservationId: reservation.id,
          userId,
          runId: runId ?? null,
          swarmId: swarmId ?? null,
        },
      });

      return reservation;
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({ reservation: result }, { status: 201 });
  } catch (error) {
    // Handle known transaction errors with appropriate status codes
    if (error instanceof Error) {
      if (error.message === "Insufficient credits") {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 400 }
        );
      }
      if (error.message === "Account not found") {
        return NextResponse.json(
          { error: "Credit account not found" },
          { status: 404 }
        );
      }
    }
    console.error("Failed to create reservation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
