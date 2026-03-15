import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLoginUrl } from "@/lib/kite";
import {
  findAccessibleBrokerAccount,
  getAuthenticatedUserId,
} from "../_auth";
import { setBrokerLoginState } from "../_state";

const querySchema = z.object({
  workspaceId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    const lookup = await findAccessibleBrokerAccount(userId, workspaceId);
    if (lookup.kind === "forbidden") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (lookup.kind === "ambiguous") {
      return NextResponse.json(
        { error: "workspaceId is required when multiple broker accounts are accessible" },
        { status: 400 },
      );
    }
    if (lookup.kind === "missing") {
      return NextResponse.json(
        { error: "No Zerodha broker account configured for this workspace" },
        { status: 404 },
      );
    }

    const { brokerAccount } = lookup;
    const loginUrl = getLoginUrl(brokerAccount.apiKey);
    const wantsRedirect =
      req.headers.get("sec-fetch-dest") === "document" ||
      req.headers.get("accept")?.includes("text/html") === true;

    const response = wantsRedirect
      ? NextResponse.redirect(loginUrl)
      : NextResponse.json({
          loginUrl,
          apiKey: brokerAccount.apiKey,
          workspaceId: brokerAccount.workspaceId,
        });

    setBrokerLoginState(response, {
      brokerAccountId: brokerAccount.id,
      userId,
      workspaceId: brokerAccount.workspaceId,
    });

    return response;
  } catch (error) {
    console.error("Failed to generate login URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
