import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { exchangeToken } from "@/lib/kite";

const callbackSchema = z.object({
  request_token: z.string().min(1, "request_token is required"),
  status: z.literal("success", {
    errorMap: () => ({ message: "status must be 'success'" }),
  }),
  workspaceId: z.string().optional(),
});

function getNextDaySixAM(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(6, 0, 0, 0);
  return next;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const parsed = callbackSchema.safeParse({
      request_token: searchParams.get("request_token"),
      status: searchParams.get("status"),
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set("error", "Invalid callback parameters");
      return NextResponse.redirect(redirectUrl);
    }

    const { request_token, workspaceId } = parsed.data;
    // status is already validated as "success" by the schema's z.literal()

    // Find broker account - try workspaceId first, then fallback to most recent
    let brokerAccount;
    if (workspaceId) {
      brokerAccount = await db.brokerAccount.findFirst({
        where: { workspaceId, broker: "ZERODHA" },
      });
    }

    if (!brokerAccount) {
      brokerAccount = await db.brokerAccount.findFirst({
        where: { broker: "ZERODHA" },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!brokerAccount) {
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set("error", "No broker account found");
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange request_token for access_token using kite utility
    let sessionData;
    try {
      sessionData = await exchangeToken(
        brokerAccount.apiKey,
        brokerAccount.apiSecret,
        request_token
      );
    } catch (kiteError) {
      console.error("Kite session generation failed:", kiteError);
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set(
        "error",
        "Failed to generate broker session"
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Store broker session
    const expiresAt = getNextDaySixAM();

    await db.brokerSession.upsert({
      where: { brokerAccountId: brokerAccount.id },
      update: {
        accessToken: sessionData.accessToken,
        loginTime: new Date(),
        expiresAt,
        status: "ACTIVE",
      },
      create: {
        brokerAccountId: brokerAccount.id,
        accessToken: sessionData.accessToken,
        loginTime: new Date(),
        expiresAt,
        status: "ACTIVE",
      },
    });

    // Redirect to brokerage page — do NOT return access tokens in the response
    const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
    redirectUrl.searchParams.set("success", "Broker connected successfully");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Zerodha callback error:", error);
    const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
    redirectUrl.searchParams.set("error", "An unexpected error occurred");
    return NextResponse.redirect(redirectUrl);
  }
}
