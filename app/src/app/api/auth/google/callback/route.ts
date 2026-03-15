import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  buildGoogleConsentUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
  createSession,
  COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth";

function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

function redirectToLogin(_req: NextRequest, error: string) {
  const response = NextResponse.redirect(`${BASE_URL}/login?error=${error}`);
  clearOAuthStateCookie(response);
  return response;
}

function statesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function GET(req: NextRequest) {
  try {
    const isOAuthStart = req.nextUrl.searchParams.get("oauth_start") === "1";
    if (isOAuthStart) {
      const state = req.nextUrl.searchParams.get("state");
      if (!state) {
        console.error("Google OAuth bootstrap: missing state parameter");
        return redirectToLogin(req, "state_missing");
      }

      const response = NextResponse.redirect(buildGoogleConsentUrl(state));
      response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_MS / 1000,
      });
      return response;
    }

    const code = req.nextUrl.searchParams.get("code");
    const returnedState = req.nextUrl.searchParams.get("state");
    const expectedState =
      req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)?.value ?? null;

    if (!code) {
      console.error("Google OAuth callback: no code parameter");
      return redirectToLogin(req, "no_code");
    }

    if (!returnedState || !expectedState || !statesMatch(expectedState, returnedState)) {
      console.error("Google OAuth callback: invalid or missing state");
      return redirectToLogin(req, "state_mismatch");
    }

    let tokens;
    try {
      tokens = await exchangeGoogleCode(code);
    } catch (err) {
      console.error("Google token exchange error:", err);
      return redirectToLogin(req, "token_exchange");
    }

    let googleUser;
    try {
      googleUser = await getGoogleUserInfo(tokens.access_token);
    } catch (err) {
      console.error("Google user info error:", err);
      return redirectToLogin(req, "user_info");
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();
    let user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      const result = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: googleUser.name || normalizedEmail.split("@")[0],
            avatarUrl: googleUser.picture || null,
          },
        });

        const baseSlug = normalizedEmail
          .split("@")[0]
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, "");
        const slug = `${baseSlug}-lab`;

        const workspace = await tx.workspace.create({
          data: {
            name: `${newUser.name}'s Lab`,
            slug,
            type: "SOLO_LAB",
          },
        });

        await tx.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: newUser.id,
            role: "OWNER",
          },
        });

        await tx.creditAccount.createMany({
          data: [
            { workspaceId: workspace.id, bucket: "TESTING", balance: 1000 },
            { workspaceId: workspace.id, bucket: "LIVE_OPS", balance: 0 },
          ],
        });

        await tx.onboardingChecklist.create({
          data: {
            workspaceId: workspace.id,
            workspaceCreated: true,
          },
        });

        return { user: newUser, workspace };
      });

      user = result.user;
    } else {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          avatarUrl: user.avatarUrl || googleUser.picture || null,
          name: user.name || googleUser.name || null,
        },
      });
    }

    const sessionToken = await createSession(user.id);
    const response = NextResponse.redirect(`${BASE_URL}/`);
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    clearOAuthStateCookie(response);

    return response;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return redirectToLogin(req, "server_error");
  }
}
