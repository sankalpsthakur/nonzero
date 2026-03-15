import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { exchangeToken } from "@/lib/kite";
import { clearBrokerLoginState, readBrokerLoginState } from "../_state";

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

    const { request_token } = parsed.data;
    const state = readBrokerLoginState(req);
    if (!state) {
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set("error", "Missing or expired login state");
      const response = NextResponse.redirect(redirectUrl);
      clearBrokerLoginState(response);
      return response;
    }

    const brokerAccount = await db.brokerAccount.findFirst({
      where: {
        id: state.brokerAccountId,
        workspaceId: state.workspaceId,
        provider: "ZERODHA",
      },
    });
    if (!brokerAccount) {
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set("error", "No broker account found");
      const response = NextResponse.redirect(redirectUrl);
      clearBrokerLoginState(response);
      return response;
    }

    let sessionData;
    try {
      sessionData = await exchangeToken(
        brokerAccount.apiKey,
        brokerAccount.apiSecretEncrypted,
        request_token,
      );
    } catch (kiteError) {
      console.error("Kite session generation failed:", kiteError);
      const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
      redirectUrl.searchParams.set(
        "error",
        "Failed to generate broker session"
      );
      const response = NextResponse.redirect(redirectUrl);
      clearBrokerLoginState(response);
      return response;
    }

    const expiresAt = getNextDaySixAM();

    await db.$transaction(async (tx) => {
      await tx.brokerSession.updateMany({
        where: {
          brokerAccountId: brokerAccount.id,
          isActive: true,
        },
        data: { isActive: false },
      });

      await tx.brokerSession.create({
        data: {
          brokerAccountId: brokerAccount.id,
          accessToken: sessionData.accessToken,
          publicToken: sessionData.publicToken,
          loginTime: new Date(sessionData.loginTime),
          expiresAt,
          isActive: true,
        },
      });

      await tx.brokerAccount.update({
        where: { id: brokerAccount.id },
        data: { status: "CONNECTED" },
      });
    });

    const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
    redirectUrl.searchParams.set("workspaceId", state.workspaceId);
    redirectUrl.searchParams.set("success", "Broker connected successfully");
    const response = NextResponse.redirect(redirectUrl);
    clearBrokerLoginState(response);
    return response;
  } catch (error) {
    console.error("Zerodha callback error:", error);
    const redirectUrl = new URL("/brokerage", req.nextUrl.origin);
    redirectUrl.searchParams.set("error", "An unexpected error occurred");
    const response = NextResponse.redirect(redirectUrl);
    clearBrokerLoginState(response);
    return response;
  }
}
