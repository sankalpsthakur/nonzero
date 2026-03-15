import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";
import { creditService } from "@/lib/credits/credit-service";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    const { limit, offset } = parsed.success
      ? parsed.data
      : { limit: 20, offset: 0 };

    const accounts = await db.creditAccount.findMany({
      where: { workspaceId },
      orderBy: { bucket: "asc" },
    });

    const ledgerEntries = await db.creditLedgerEntry.findMany({
      where: { account: { workspaceId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        account: { select: { bucket: true } },
      },
    });

    const reservations = await db.creditReservation.findMany({
      where: {
        account: { workspaceId },
        status: "PENDING",
      },
      include: {
        account: { select: { bucket: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const [spendByMember, spendBySwarm] = await Promise.all([
      creditService.getSpendByMember(workspaceId),
      creditService.getSpendBySwarm(workspaceId),
    ]);

    return NextResponse.json({
      accounts,
      ledgerEntries,
      reservations,
      spendByMember,
      spendBySwarm,
      spendByFamily: [],
    });
  } catch (error) {
    console.error("Failed to get credit data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
