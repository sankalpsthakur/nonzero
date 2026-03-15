import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

const querySchema = z.object({
  workspaceId: z.string().min(1),
  accountBucket: z.enum(["TESTING", "LIVE_OPS"]).optional(),
  type: z.enum(["RESERVE", "DEBIT", "RELEASE", "TOPUP"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
      accountBucket: searchParams.get("accountBucket") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { workspaceId, accountBucket, type, startDate, endDate, limit, offset } =
      parsed.data;

    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: auth.userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const where: {
      account: { workspaceId: string; bucket?: "TESTING" | "LIVE_OPS" };
      type?: "RESERVE" | "DEBIT" | "RELEASE" | "TOPUP";
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      account: { workspaceId },
    };

    if (accountBucket) {
      where.account.bucket = accountBucket;
    }
    if (type) {
      where.type = type;
    }
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const [entries, total, aggregates] = await Promise.all([
      db.creditLedgerEntry.findMany({
        where,
        include: {
          account: {
            select: { id: true, bucket: true, balance: true, reservedBalance: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.creditLedgerEntry.count({ where }),
      db.creditLedgerEntry.groupBy({
        by: ["type"],
        where: { account: { workspaceId } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      entries,
      aggregates,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Failed to get ledger entries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
