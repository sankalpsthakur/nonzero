import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result for a single broker session health check. */
export interface SessionCheckResult {
  brokerAccountId: string;
  provider: string;
  clientId: string | null;
  sessionId: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  expiringWithinHour: boolean;
  isDead: boolean;
  hasLiveDeployments: boolean;
  incidentCreated: boolean;
}

/** Summary returned by the morning health check. */
export interface SessionCheckSummary {
  results: SessionCheckResult[];
  totalAccounts: number;
  healthy: number;
  expiringSoon: number;
  dead: number;
  incidentsCreated: number;
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Morning broker session health check.
 *
 * Iterates over all connected broker accounts, inspects their active
 * sessions, and flags any that are about to expire or are already dead.
 *
 * If a session is dead and there are active live deployments associated
 * with the same workspace, an Incident is created so the operations
 * team can intervene before market open.
 *
 * Intended to run daily before market open (~08:00 AM IST).
 *
 * @returns Array of check results, one per broker account.
 */
export async function checkBrokerSessions(): Promise<SessionCheckSummary> {
  const checkedAt = new Date();
  const oneHourFromNow = new Date(checkedAt.getTime() + 60 * 60 * 1000);

  // Fetch all broker accounts with their latest session
  const brokerAccounts = await db.brokerAccount.findMany({
    include: {
      sessions: {
        where: { isActive: true },
        orderBy: { loginTime: "desc" },
        take: 1,
      },
    },
  });

  const results: SessionCheckResult[] = [];
  let incidentsCreated = 0;

  for (const account of brokerAccounts) {
    const latestSession = account.sessions[0] ?? null;

    const isActive = !!latestSession;
    const expiresAt = latestSession?.expiresAt ?? null;
    const expiringWithinHour =
      !!expiresAt && expiresAt <= oneHourFromNow && expiresAt > checkedAt;
    const isDead =
      !isActive ||
      (!!expiresAt && expiresAt <= checkedAt);

    // Check for live deployments in this workspace
    const liveDeploymentCount = await db.deployment.count({
      where: {
        workspaceId: account.workspaceId,
        environment: "LIVE",
        status: { in: ["ACTIVE", "APPROVED"] },
      },
    });
    const hasLiveDeployments = liveDeploymentCount > 0;

    let incidentCreated = false;

    // Create incident if session is dead AND there are live deployments
    if (isDead && hasLiveDeployments) {
      await db.incident.create({
        data: {
          workspaceId: account.workspaceId,
          type: "EXECUTION_FAILURE",
          status: "OPEN",
          description:
            `Broker session for ${account.provider} (client: ${account.clientId ?? "unknown"}) ` +
            `is dead or expired. There are ${liveDeploymentCount} active live deployment(s) ` +
            `that will be unable to execute orders. Immediate session refresh required.`,
        },
      });
      incidentCreated = true;
      incidentsCreated++;
    }

    // If session is expiring soon, update account status as a warning
    if (expiringWithinHour && account.status !== "ERROR") {
      await db.brokerAccount.update({
        where: { id: account.id },
        data: { status: "DISCONNECTED" },
      });
    }

    // If session is dead, mark account as errored
    if (isDead && account.status !== "ERROR") {
      await db.brokerAccount.update({
        where: { id: account.id },
        data: { status: "ERROR" },
      });
    }

    results.push({
      brokerAccountId: account.id,
      provider: account.provider,
      clientId: account.clientId,
      sessionId: latestSession?.id ?? null,
      isActive,
      expiresAt,
      expiringWithinHour,
      isDead,
      hasLiveDeployments,
      incidentCreated,
    });
  }

  const healthy = results.filter((r) => !r.isDead && !r.expiringWithinHour).length;
  const expiringSoon = results.filter((r) => r.expiringWithinHour).length;
  const dead = results.filter((r) => r.isDead).length;

  console.log(
    `[session-check] total=${results.length} healthy=${healthy} expiringSoon=${expiringSoon} dead=${dead} incidentsCreated=${incidentsCreated}`,
  );

  return {
    results,
    totalAccounts: results.length,
    healthy,
    expiringSoon,
    dead,
    incidentsCreated,
    checkedAt,
  };
}
