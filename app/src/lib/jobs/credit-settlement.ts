import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of settling a single credit reservation. */
export interface ReservationSettlement {
  reservationId: string;
  accountId: string;
  originalAmount: number;
  actualUsage: number;
  released: number;
  debited: number;
  runId: string | null;
  swarmId: string | null;
}

/** Summary of the full settlement batch. */
export interface SettlementResult {
  settlements: ReservationSettlement[];
  totalReservationsSettled: number;
  totalDebited: number;
  totalReleased: number;
  ledgerEntriesCreated: number;
  settledAt: Date;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes sandbox-seconds consumed by a run.
 *
 * If the run has startedAt and completedAt, the duration is computed from
 * those timestamps. Otherwise falls back to 0.
 */
async function computeSandboxSeconds(runId: string): Promise<number> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: { startedAt: true, completedAt: true },
  });

  if (!run?.startedAt) return 0;

  const endTime = run.completedAt ?? new Date();
  const durationMs = endTime.getTime() - run.startedAt.getTime();
  return Math.max(0, Math.ceil(durationMs / 1000));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Credit settlement job.
 *
 * Finds all PENDING credit reservations associated with completed (or
 * failed/stopped) runs and settles them by:
 *
 *   1. Computing the actual sandbox-seconds consumed by the run.
 *   2. Debiting the actual usage from the reservation.
 *   3. Releasing any unused reserved amount back to the credit account.
 *   4. Writing ledger entries for both the debit and the release.
 *   5. Marking the reservation as SETTLED.
 *
 * This job should run periodically (e.g. every 15 minutes or at end of day)
 * to ensure credit accounts reflect actual usage promptly.
 *
 * @returns Settlement statistics.
 */
export async function settleReservations(): Promise<SettlementResult> {
  const startTime = Date.now();
  const settledAt = new Date();

  // Find PENDING reservations with associated completed runs
  const reservations = await db.creditReservation.findMany({
    where: {
      status: "PENDING",
    },
    include: {
      account: true,
    },
  });

  const settlements: ReservationSettlement[] = [];
  let totalDebited = 0;
  let totalReleased = 0;
  let ledgerEntriesCreated = 0;

  for (const reservation of reservations) {
    // Determine if the associated run/swarm is completed
    let isComplete = false;
    let sandboxSeconds = 0;

    if (reservation.runId) {
      const run = await db.run.findUnique({
        where: { id: reservation.runId },
        select: { status: true },
      });

      if (run && ["COMPLETED", "FAILED", "STOPPED"].includes(run.status)) {
        isComplete = true;
        sandboxSeconds = await computeSandboxSeconds(reservation.runId);
      }
    } else if (reservation.swarmId) {
      const swarm = await db.swarm.findUnique({
        where: { id: reservation.swarmId },
        select: { status: true },
      });

      if (swarm && ["COMPLETED", "FAILED"].includes(swarm.status)) {
        isComplete = true;

        // For swarms, sum sandbox-seconds across all child runs
        const children = await db.swarmChild.findMany({
          where: { swarmId: reservation.swarmId },
          select: { runId: true },
        });

        for (const child of children) {
          if (child.runId) {
            sandboxSeconds += await computeSandboxSeconds(child.runId);
          }
        }
      }
    } else {
      // Orphan reservation with no run or swarm — settle as zero usage
      isComplete = true;
    }

    if (!isComplete) continue;

    // Calculate actual usage (capped at reserved amount)
    // Credit cost is 1 credit per sandbox-second (configurable upstream)
    const originalAmount = Number(reservation.amount);
    const actualUsage = Math.min(sandboxSeconds, originalAmount);
    const released = originalAmount - actualUsage;

    await db.$transaction(async (tx) => {
      // Settle the reservation
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: "SETTLED",
          settledAt,
        },
      });

      // Debit actual usage (ledger entry)
      if (actualUsage > 0) {
        await tx.creditLedgerEntry.create({
          data: {
            accountId: reservation.accountId,
            type: "DEBIT",
            amount: actualUsage,
            description: `Settlement debit: ${sandboxSeconds} sandbox-seconds`,
            referenceType: reservation.runId ? "RUN" : "SWARM",
            referenceId: reservation.runId ?? reservation.swarmId ?? undefined,
          },
        });
        ledgerEntriesCreated++;
      }

      // Release unused amount back to the account
      if (released > 0) {
        await tx.creditAccount.update({
          where: { id: reservation.accountId },
          data: { balance: { increment: released } },
        });

        await tx.creditLedgerEntry.create({
          data: {
            accountId: reservation.accountId,
            type: "RELEASE",
            amount: released,
            description: `Settlement release: ${released} credits returned`,
            referenceType: reservation.runId ? "RUN" : "SWARM",
            referenceId: reservation.runId ?? reservation.swarmId ?? undefined,
          },
        });
        ledgerEntriesCreated++;
      }
    });

    totalDebited += actualUsage;
    totalReleased += released;

    settlements.push({
      reservationId: reservation.id,
      accountId: reservation.accountId,
      originalAmount,
      actualUsage,
      released,
      debited: actualUsage,
      runId: reservation.runId,
      swarmId: reservation.swarmId,
    });
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[credit-settlement] settled=${settlements.length} debited=${totalDebited} released=${totalReleased} ledgerEntries=${ledgerEntriesCreated} duration=${durationMs}ms`,
  );

  return {
    settlements,
    totalReservationsSettled: settlements.length,
    totalDebited,
    totalReleased,
    ledgerEntriesCreated,
    settledAt,
    durationMs,
  };
}
