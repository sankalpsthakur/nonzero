import { NextRequest } from "next/server";
import db from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";

function allowHeaderFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function getAuthenticatedUserId(
  req: NextRequest,
): Promise<string | null> {
  const auth = await getAuthFromRequest(req);
  if (auth?.userId) {
    return auth.userId;
  }

  if (allowHeaderFallback()) {
    return req.headers.get("x-user-id");
  }

  return null;
}

export async function hasWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const membership = await db.workspaceMembership.findFirst({
    where: { userId, workspaceId },
    select: { id: true },
  });

  return Boolean(membership);
}

export async function findAccessibleBrokerAccount(
  userId: string,
  workspaceId?: string,
) {
  if (workspaceId) {
    const allowed = await hasWorkspaceAccess(userId, workspaceId);
    if (!allowed) {
      return { kind: "forbidden" as const };
    }

    const brokerAccount = await db.brokerAccount.findFirst({
      where: {
        workspaceId,
        provider: "ZERODHA",
      },
    });

    return brokerAccount
      ? { kind: "ok" as const, brokerAccount }
      : { kind: "missing" as const };
  }

  const brokerAccounts = await db.brokerAccount.findMany({
    where: {
      provider: "ZERODHA",
      workspace: {
        memberships: {
          some: { userId },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (brokerAccounts.length === 0) {
    return { kind: "missing" as const };
  }

  if (brokerAccounts.length > 1) {
    return { kind: "ambiguous" as const };
  }

  return { kind: "ok" as const, brokerAccount: brokerAccounts[0] };
}
