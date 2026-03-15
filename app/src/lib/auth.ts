import crypto from "crypto";
import { NextRequest } from "next/server";
import db from "@/lib/db";
import type { MemberRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Google OAuth helpers
// ---------------------------------------------------------------------------

/**
 * Build the Google OAuth 2.0 authorization URL.
 */
export function getGoogleAuthUrl(): string {
  const state = crypto.randomBytes(32).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an authorization code for Google tokens.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Google token exchange failed:", body);
    throw new Error("Token exchange failed");
  }
  return res.json();
}

/**
 * Fetch the authenticated user's profile from Google.
 */
export async function getGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUser> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to get user info");
  return res.json();
}

interface GoogleTokens {
  access_token: string;
  id_token: string;
  refresh_token?: string;
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

// Re-export the GoogleUser type for use in the callback route
export type { GoogleUser, GoogleTokens };

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new session for the given user. Returns the session token.
 */
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await db.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validate a session token. Returns the userId (and optional workspaceId from
 * the user's first membership) if valid, or null if expired / not found.
 */
export async function validateSession(
  token: string,
): Promise<{ userId: string; workspaceId?: string } | null> {
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: {
            select: { workspaceId: true },
            take: 1,
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    userId: session.userId,
    workspaceId: session.user.memberships[0]?.workspaceId,
  };
}

/**
 * Delete a session (logout).
 */
export async function deleteSession(token: string): Promise<void> {
  await db.session.delete({ where: { token } }).catch(() => {
    // Ignore if already deleted
  });
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

const COOKIE_NAME = "nonzero-session";

/**
 * Extract and validate the session from the request cookie.
 * Returns { userId } if valid, null otherwise.
 */
export async function getAuthFromRequest(
  req: NextRequest,
): Promise<{ userId: string; workspaceId?: string } | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  return validateSession(token);
}

/**
 * Require an authenticated session and return the current user ID.
 */
export async function requireUserId(req: NextRequest): Promise<string | null> {
  const auth = await getAuthFromRequest(req);
  return auth?.userId ?? null;
}

/**
 * Require that the current session belongs to a workspace member.
 */
export async function requireWorkspaceMembership(
  req: NextRequest,
  workspaceId: string,
  roles?: MemberRole[],
) {
  const userId = await requireUserId(req);
  if (!userId) {
    return null;
  }

  const membership = await db.workspaceMembership.findFirst({
    where: {
      workspaceId,
      userId,
      ...(roles ? { role: { in: roles } } : {}),
    },
  });

  if (!membership) {
    return null;
  }

  return { userId, membership };
}

export { COOKIE_NAME, SESSION_MAX_AGE_MS };
