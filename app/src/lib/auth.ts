import crypto from "crypto";
import { NextRequest } from "next/server";
import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2 via Node.js crypto)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 32;
const KEY_BYTES = 64;
const DIGEST = "sha512";

/**
 * Hash a password using PBKDF2 with a random salt.
 * Returns "salt:hash" (both hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_BYTES,
      DIGEST,
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
      },
    );
  });
}

/**
 * Verify a password against a stored "salt:hash" string.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_BYTES,
      DIGEST,
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(crypto.timingSafeEqual(derivedKey, Buffer.from(keyHex, "hex")));
      },
    );
  });
}

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

export { COOKIE_NAME, SESSION_MAX_AGE_MS };
