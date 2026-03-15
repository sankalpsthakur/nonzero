import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  exchangeGoogleCode,
  getGoogleUserInfo,
  createSession,
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      console.error("Google OAuth callback: no code parameter");
      return NextResponse.redirect(
        new URL("/login?error=no_code", req.url),
      );
    }

    // Exchange authorization code for tokens
    let tokens;
    try {
      tokens = await exchangeGoogleCode(code);
    } catch (err) {
      console.error("Google token exchange error:", err);
      return NextResponse.redirect(
        new URL("/login?error=token_exchange", req.url),
      );
    }

    // Get user profile from Google
    let googleUser;
    try {
      googleUser = await getGoogleUserInfo(tokens.access_token);
    } catch (err) {
      console.error("Google user info error:", err);
      return NextResponse.redirect(
        new URL("/login?error=user_info", req.url),
      );
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();

    // Find or create user
    let user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // First-time user -- create user + workspace + credits in a transaction
      const result = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: googleUser.name || normalizedEmail.split("@")[0],
            avatarUrl: googleUser.picture || null,
            googleId: googleUser.id,
          },
        });

        // Generate workspace slug from email prefix
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

        // Create starter credit accounts
        await tx.creditAccount.createMany({
          data: [
            {
              workspaceId: workspace.id,
              bucket: "TESTING",
              balance: 1000,
            },
            {
              workspaceId: workspace.id,
              bucket: "LIVE_OPS",
              balance: 0,
            },
          ],
        });

        // Create onboarding checklist
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
      // Existing user -- update Google ID and avatar if not already set
      if (!user.googleId || !user.avatarUrl) {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId || googleUser.id,
            avatarUrl: user.avatarUrl || googleUser.picture || null,
            name: user.name || googleUser.name || null,
          },
        });
      }
    }

    // Create session
    const sessionToken = await createSession(user.id);

    // Set cookie and redirect to dashboard
    const response = NextResponse.redirect(new URL("/", req.url));
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000, // maxAge is in seconds
    });

    return response;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", req.url),
    );
  }
}
