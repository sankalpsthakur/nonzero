import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export interface BrokerLoginState {
  brokerAccountId: string;
  userId: string;
  workspaceId: string;
  expiresAt: number;
}

const COOKIE_NAME = "nonzero_broker_state";
const STATE_TTL_SECONDS = 10 * 60;

function stateSecret(): string {
  const secret =
    process.env.BROKER_STATE_SECRET ??
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "nonzero-local-broker-state-secret");

  if (!secret) {
    throw new Error(
      "BROKER_STATE_SECRET or SESSION_SECRET must be configured in production.",
    );
  }

  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function setBrokerLoginState(
  response: NextResponse,
  payload: Omit<BrokerLoginState, "expiresAt">,
): void {
  const value: BrokerLoginState = {
    ...payload,
    expiresAt: Date.now() + STATE_TTL_SECONDS * 1000,
  };

  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${encoded}.${sign(encoded)}`;

  response.cookies.set(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
}

export function clearBrokerLoginState(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function readBrokerLoginState(
  req: NextRequest,
): BrokerLoginState | null {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [encoded, providedSignature] = raw.split(".");
  if (!encoded || !providedSignature) return null;

  const expectedSignature = sign(encoded);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as BrokerLoginState;

    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
