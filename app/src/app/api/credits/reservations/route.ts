import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";
import { creditService } from "@/lib/credits/credit-service";
import { InsufficientCreditsError } from "@/lib/credits/types";

const createReservationSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  runId: z.string().optional(),
  swarmId: z.string().optional(),
  description: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["PENDING", "SETTLED", "RELEASED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
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
        { status: 400 },
      );
    }

    const { workspaceId, status, limit, offset } = parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: {
      account: { workspaceId: string };
      status?: "PENDING" | "SETTLED" | "RELEASED";
    } = {
      account: { workspaceId },
    };
    if (status) {
      where.status = status;
    }

    const [reservations, total] = await Promise.all([
      db.creditReservation.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              bucket: true,
              balance: true,
              reservedBalance: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.creditReservation.count({ where }),
    ]);

    const totalReserved = reservations
      .filter((reservation) => reservation.status === "PENDING")
      .reduce((sum, reservation) => sum + Number(reservation.amount), 0);

    return NextResponse.json({
      reservations,
      totalReserved,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to list reservations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { accountId, amount, runId, swarmId, description } = parsed.data;

    const account = await db.creditAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Credit account not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: account.workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const reservation = await creditService.reserveCredits(accountId, amount, {
      description,
      runId,
      swarmId,
      memberId: auth.userId,
    });

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          accountId: error.accountId,
          requested: error.requested,
          available: error.available,
        },
        { status: 400 },
      );
    }

    console.error("Failed to create reservation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
