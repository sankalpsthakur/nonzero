import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const releaseSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reservation = await db.creditReservation.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId: reservation.account.workspaceId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (reservation.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Reservation is already ${reservation.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = releaseSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    // Calculate unused credits to return
    const unusedAmount = reservation.amount - reservation.consumed;

    const result = await db.$transaction(async (tx) => {
      // Update reservation status
      const updated = await tx.creditReservation.update({
        where: { id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
        },
      });

      // Return unused credits to account
      if (unusedAmount > 0) {
        await tx.creditAccount.update({
          where: { id: reservation.accountId },
          data: { balance: { increment: unusedAmount } },
        });

        // Create ledger entry for the refund
        const account = await tx.creditAccount.findUnique({
          where: { id: reservation.accountId },
        });

        await tx.creditLedgerEntry.create({
          data: {
            accountId: reservation.accountId,
            type: "REFUND",
            amount: unusedAmount,
            balance: (account?.balance ?? 0) + unusedAmount,
            description:
              reason ?? `Released reservation: ${unusedAmount} credits returned`,
            reservationId: id,
            userId,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({
      reservation: result,
      returned: unusedAmount,
      consumed: reservation.consumed,
    });
  } catch (error) {
    console.error("Failed to release reservation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
