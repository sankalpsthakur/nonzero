import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";
import { creditService } from "@/lib/credits/credit-service";
import { AlreadySettledError } from "@/lib/credits/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const reservation = await db.creditReservation.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    const membership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: reservation.account.workspaceId,
        userId: auth.userId,
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await creditService.releaseReservation(id);

    return NextResponse.json({
      reservationId: id,
      status: "RELEASED",
    });
  } catch (error) {
    if (error instanceof AlreadySettledError) {
      return NextResponse.json(
        {
          error: "Reservation cannot be released",
          reservationId: error.reservationId,
          currentStatus: error.currentStatus,
        },
        { status: 409 },
      );
    }

    console.error("Failed to release reservation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
