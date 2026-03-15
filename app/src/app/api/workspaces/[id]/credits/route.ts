import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    const { limit, offset } = parsed.success
      ? parsed.data
      : { limit: 20, offset: 0 };

    // Fetch credit accounts (balances)
    const accounts = await db.creditAccount.findMany({
      where: { workspaceId },
    });

    // Fetch recent ledger entries
    const ledgerEntries = await db.creditLedgerEntry.findMany({
      where: {
        account: { workspaceId },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        account: { select: { type: true } },
      },
    });

    // Fetch active reservations
    const reservations = await db.creditReservation.findMany({
      where: {
        account: { workspaceId },
        status: "ACTIVE",
      },
      include: {
        account: { select: { type: true } },
      },
    });

    // Spend by member
    const spendByMember = await db.creditLedgerEntry.groupBy({
      by: ["userId"],
      where: {
        account: { workspaceId },
        type: "DEBIT",
      },
      _sum: { amount: true },
    });

    // Spend by swarm
    const spendBySwarm = await db.creditLedgerEntry.groupBy({
      by: ["swarmId"],
      where: {
        account: { workspaceId },
        type: "DEBIT",
        swarmId: { not: null },
      },
      _sum: { amount: true },
    });

    // Spend by family
    const spendByFamily = await db.creditLedgerEntry.groupBy({
      by: ["familyId"],
      where: {
        account: { workspaceId },
        type: "DEBIT",
        familyId: { not: null },
      },
      _sum: { amount: true },
    });

    return NextResponse.json({
      accounts,
      ledgerEntries,
      reservations,
      spendByMember,
      spendBySwarm,
      spendByFamily,
    });
  } catch (error) {
    console.error("Failed to get credit data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
