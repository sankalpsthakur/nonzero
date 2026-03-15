import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import db from "@/lib/db";

const postbackSchema = z.object({
  order_id: z.string(),
  exchange_order_id: z.string().optional(),
  placed_by: z.string().optional(),
  status: z.string(),
  status_message: z.string().optional(),
  tradingsymbol: z.string(),
  exchange: z.string(),
  order_type: z.string(),
  transaction_type: z.string(),
  validity: z.string().optional(),
  product: z.string(),
  quantity: z.coerce.number(),
  price: z.coerce.number().optional(),
  trigger_price: z.coerce.number().optional(),
  average_price: z.coerce.number().optional(),
  filled_quantity: z.coerce.number().optional(),
  pending_quantity: z.coerce.number().optional(),
  cancelled_quantity: z.coerce.number().optional(),
  tag: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

function isAuthorizedPostback(req: NextRequest): boolean {
  const configuredSecret = process.env.KITE_POSTBACK_SECRET;
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const providedSecret = req.headers.get("x-kite-postback-secret");
  if (!providedSecret) return false;

  const expected = Buffer.from(configuredSecret);
  const provided = Buffer.from(providedSecret);

  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedPostback(req)) {
      console.warn("[Kite Postback] Rejected unauthorized postback request");
      return NextResponse.json({ status: "ignored" }, { status: 202 });
    }

    const body = await req.json();
    const parsed = postbackSchema.safeParse(body);

    if (!parsed.success) {
      // Log invalid payload for audit trail but still return 200 to acknowledge receipt
      console.error(
        "[Kite Postback] Invalid payload received:",
        JSON.stringify(parsed.error.flatten()),
      );
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const data = parsed.data;

    // Validate that required fields are present and non-empty
    if (!data.order_id || !data.status || !data.tradingsymbol || !data.exchange) {
      console.error(
        "[Kite Postback] Missing required fields in postback payload:",
        { order_id: data.order_id, status: data.status, tradingsymbol: data.tradingsymbol, exchange: data.exchange },
      );
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // Log postback event for audit trail
    console.info(
      "[Kite Postback] Received:",
      JSON.stringify({
        order_id: data.order_id,
        status: data.status,
        tradingsymbol: data.tradingsymbol,
        exchange: data.exchange,
        transaction_type: data.transaction_type,
        quantity: data.quantity,
        filled_quantity: data.filled_quantity,
        average_price: data.average_price,
        timestamp: new Date().toISOString(),
      }),
    );

    // Find and update existing broker order
    const brokerOrder = await db.brokerOrder.findFirst({
      where: { brokerOrderId: data.order_id },
    });

    if (brokerOrder) {
      await db.brokerOrder.update({
        where: { id: brokerOrder.id },
        data: {
          status: data.status,
          statusMessage: data.status_message ?? null,
          averagePrice: data.average_price ?? null,
          filledQuantity: data.filled_quantity ?? 0,
        },
      });
    } else {
      console.warn(`[Kite Postback] Received postback for unknown order: ${data.order_id}`);
    }

    // Always return 200 OK for postbacks (Kite requirement)
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[Kite Postback] Processing error:", error);
    // Still return 200 to prevent Kite from retrying
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
