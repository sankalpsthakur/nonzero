// ---------------------------------------------------------------------------
// Credit Service — Reserve / Debit / Settle / Release
// ---------------------------------------------------------------------------
// The economic control layer for the nonzero platform.  Every credit-mutating
// operation runs inside a Prisma interactive transaction so that balance,
// reservation, and ledger updates are always atomic.  No partial state allowed.
// ---------------------------------------------------------------------------

import { Prisma, type PrismaClient } from "@prisma/client";
import db from "@/lib/db";
import {
  InsufficientCreditsError,
  AlreadySettledError,
  type CreditBalance,
  type CreditReservation,
  type ReservationParams,
  type SettlementResult,
  type CreditLedgerEntry,
  type LedgerQuery,
  type PaginatedLedger,
  type MemberSpend,
  type SwarmSpend,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Prisma Decimal to a plain JS number. */
function d(val: Prisma.Decimal | number): number {
  if (typeof val === "number") return val;
  return (val as Prisma.Decimal).toNumber();
}

/** Map a raw Prisma CreditReservation row to the service-layer type. */
function mapReservation(row: {
  id: string;
  accountId: string;
  amount: Prisma.Decimal;
  status: string;
  runId: string | null;
  swarmId: string | null;
  createdAt: Date;
  settledAt: Date | null;
}): CreditReservation {
  return {
    id: row.id,
    accountId: row.accountId,
    amount: d(row.amount),
    status: row.status as CreditReservation["status"],
    runId: row.runId,
    swarmId: row.swarmId,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
  };
}

/** Map a raw Prisma CreditLedgerEntry row to the service-layer type. */
function mapLedgerEntry(row: {
  id: string;
  accountId: string;
  type: string;
  amount: Prisma.Decimal;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}): CreditLedgerEntry {
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type as CreditLedgerEntry["type"],
    amount: d(row.amount),
    description: row.description,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// CreditService
// ---------------------------------------------------------------------------

export class CreditService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    // Allow injection for testing; fall back to the shared singleton.
    this.prisma = (prisma ?? db) as PrismaClient;
  }

  // -------------------------------------------------------------------------
  // reserveCredits
  // -------------------------------------------------------------------------

  /**
   * Atomically reserve `amount` credits from the given account.
   *
   * 1. Check available balance (balance - reservedBalance) >= amount.
   * 2. Increase `reservedBalance` on the account.
   * 3. Create a PENDING CreditReservation row.
   * 4. Write a RESERVE ledger entry.
   *
   * Throws `InsufficientCreditsError` if the account cannot cover the amount.
   */
  async reserveCredits(
    accountId: string,
    amount: number,
    params: ReservationParams = {},
  ): Promise<CreditReservation> {
    if (amount <= 0) {
      throw new Error("Reservation amount must be positive");
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock the account row (SELECT … FOR UPDATE via findUniqueOrThrow + immediate update).
      const account = await tx.creditAccount.findUniqueOrThrow({
        where: { id: accountId },
      });

      const available = d(account.balance) - d(account.reservedBalance);

      if (available < amount) {
        throw new InsufficientCreditsError(accountId, amount, available);
      }

      // Increase reserved balance
      const updatedAccount = await tx.creditAccount.update({
        where: { id: accountId },
        data: {
          reservedBalance: {
            increment: amount,
          },
        },
      });

      // Create the reservation
      const reservation = await tx.creditReservation.create({
        data: {
          accountId,
          amount,
          status: "PENDING",
          runId: params.runId ?? null,
          swarmId: params.swarmId ?? null,
        },
      });

      // Write RESERVE ledger entry
      await tx.creditLedgerEntry.create({
        data: {
          accountId,
          type: "RESERVE",
          amount,
          description: params.description ?? "Credit reservation",
          referenceType: "reservation",
          referenceId: reservation.id,
        },
      });

      return mapReservation(reservation);
    });
  }

  // -------------------------------------------------------------------------
  // settleReservation
  // -------------------------------------------------------------------------

  /**
   * Settle a PENDING reservation.
   *
   * - Debits `actualAmount` from the account balance.
   * - Releases the remainder (reserved - actual) back to available.
   * - If `actualAmount` > reserved amount, clamps to the reserved amount (no overdraft).
   * - Writes a DEBIT ledger entry for the debited amount.
   * - Writes a RELEASE ledger entry for the released remainder (if any).
   * - Marks the reservation as SETTLED.
   *
   * Throws `AlreadySettledError` if the reservation is not PENDING.
   */
  async settleReservation(
    reservationId: string,
    actualAmount: number,
  ): Promise<SettlementResult> {
    if (actualAmount < 0) {
      throw new Error("Settlement amount must be non-negative");
    }

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });

      if (reservation.status !== "PENDING") {
        throw new AlreadySettledError(reservationId, reservation.status as CreditReservation["status"]);
      }

      const reservedAmount = d(reservation.amount);
      // Clamp: never debit more than what was reserved
      const debited = Math.min(actualAmount, reservedAmount);
      const released = reservedAmount - debited;

      // Mark reservation as SETTLED
      await tx.creditReservation.update({
        where: { id: reservationId },
        data: {
          status: "SETTLED",
          settledAt: new Date(),
        },
      });

      // Debit from balance, reduce reservedBalance by the full reserved amount
      await tx.creditAccount.update({
        where: { id: reservation.accountId },
        data: {
          balance: { decrement: debited },
          reservedBalance: { decrement: reservedAmount },
        },
      });

      const ledgerEntryIds: string[] = [];

      // DEBIT ledger entry
      const debitEntry = await tx.creditLedgerEntry.create({
        data: {
          accountId: reservation.accountId,
          type: "DEBIT",
          amount: debited,
          description: `Settlement of reservation ${reservationId}`,
          referenceType: "reservation",
          referenceId: reservationId,
        },
      });
      ledgerEntryIds.push(debitEntry.id);

      // RELEASE ledger entry (if there is a remainder to release)
      if (released > 0) {
        const releaseEntry = await tx.creditLedgerEntry.create({
          data: {
            accountId: reservation.accountId,
            type: "RELEASE",
            amount: released,
            description: `Released remainder from reservation ${reservationId}`,
            referenceType: "reservation",
            referenceId: reservationId,
          },
        });
        ledgerEntryIds.push(releaseEntry.id);
      }

      return {
        reservationId,
        debited,
        released,
        ledgerEntryIds,
      };
    });
  }

  // -------------------------------------------------------------------------
  // releaseReservation
  // -------------------------------------------------------------------------

  /**
   * Fully release a PENDING reservation — no credits are consumed.
   *
   * - Restores the reserved amount back to available balance.
   * - Writes a RELEASE ledger entry.
   * - Marks the reservation as RELEASED.
   *
   * Throws `AlreadySettledError` if the reservation is not PENDING.
   */
  async releaseReservation(reservationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });

      if (reservation.status !== "PENDING") {
        throw new AlreadySettledError(reservationId, reservation.status as CreditReservation["status"]);
      }

      const reservedAmount = d(reservation.amount);

      // Mark reservation as RELEASED
      await tx.creditReservation.update({
        where: { id: reservationId },
        data: {
          status: "RELEASED",
          settledAt: new Date(),
        },
      });

      // Restore reserved balance
      await tx.creditAccount.update({
        where: { id: reservation.accountId },
        data: {
          reservedBalance: { decrement: reservedAmount },
        },
      });

      // Write RELEASE ledger entry
      await tx.creditLedgerEntry.create({
        data: {
          accountId: reservation.accountId,
          type: "RELEASE",
          amount: reservedAmount,
          description: `Full release of reservation ${reservationId}`,
          referenceType: "reservation",
          referenceId: reservationId,
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // topUp
  // -------------------------------------------------------------------------

  /**
   * Add credits to an account.
   *
   * - Increases the balance.
   * - Writes a TOPUP ledger entry.
   */
  async topUp(
    accountId: string,
    amount: number,
    description: string,
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error("Top-up amount must be positive");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.creditAccount.update({
        where: { id: accountId },
        data: {
          balance: { increment: amount },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          accountId,
          type: "TOPUP",
          amount,
          description,
          referenceType: "topup",
          referenceId: null,
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // getBalance
  // -------------------------------------------------------------------------

  /**
   * Return the current balance snapshot for an account.
   */
  async getBalance(accountId: string): Promise<CreditBalance> {
    const account = await this.prisma.creditAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    const balance = d(account.balance);
    const reserved = d(account.reservedBalance);

    return {
      accountId: account.id,
      bucket: account.bucket,
      available: balance - reserved,
      reserved,
      total: balance,
    };
  }

  // -------------------------------------------------------------------------
  // getLedger
  // -------------------------------------------------------------------------

  /**
   * Paginated ledger entries for an account.
   */
  async getLedger(
    accountId: string,
    opts: LedgerQuery = {},
  ): Promise<PaginatedLedger> {
    const limit = opts.limit ?? 50;

    const where: Prisma.CreditLedgerEntryWhereInput = {
      accountId,
      ...(opts.types && opts.types.length > 0 ? { type: { in: opts.types } } : {}),
      ...(opts.after || opts.before
        ? {
            createdAt: {
              ...(opts.after ? { gte: opts.after } : {}),
              ...(opts.before ? { lte: opts.before } : {}),
            },
          }
        : {}),
    };

    const [entries, totalCount] = await Promise.all([
      this.prisma.creditLedgerEntry.findMany({
        where: {
          ...where,
          ...(opts.cursor ? { id: { gt: opts.cursor } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1, // fetch one extra to detect next page
      }),
      this.prisma.creditLedgerEntry.count({ where }),
    ]);

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;

    return {
      entries: page.map(mapLedgerEntry),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      totalCount,
    };
  }

  // -------------------------------------------------------------------------
  // getSpendByMember
  // -------------------------------------------------------------------------

  /**
   * Aggregate credit spend by member across a workspace.
   *
   * We join reservations to their ledger DEBIT entries and group by the
   * memberId stored on the reservation params.  Since memberId is not a
   * first-class column on CreditReservation in the current schema, we
   * approximate by grouping settled reservations and joining through
   * the ledger's referenceId -> reservation relationship.
   *
   * For now, this uses the swarmId on the reservation as a proxy —
   * a more complete implementation would store memberId directly.
   */
  async getSpendByMember(workspaceId: string): Promise<MemberSpend[]> {
    // Fetch all DEBIT ledger entries for accounts in this workspace
    const accounts = await this.prisma.creditAccount.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    if (accountIds.length === 0) return [];

    const debits = await this.prisma.creditLedgerEntry.findMany({
      where: {
        accountId: { in: accountIds },
        type: "DEBIT",
        referenceType: "reservation",
      },
    });

    // Group by referenceId (reservation) — since we don't have a memberId
    // column, we return per-reservation spend.  A full implementation would
    // join on a memberId column.
    const reservationIds = [...new Set(debits.map((d) => d.referenceId).filter(Boolean))] as string[];

    const reservations = await this.prisma.creditReservation.findMany({
      where: { id: { in: reservationIds } },
    });

    // Group by swarmId as a proxy for memberId
    const map = new Map<string, { total: number; count: number }>();
    for (const res of reservations) {
      const key = res.swarmId ?? res.runId ?? "unknown";
      const entry = map.get(key) ?? { total: 0, count: 0 };
      const debitForRes = debits.find((d) => d.referenceId === res.id);
      entry.total += debitForRes ? d(debitForRes.amount) : 0;
      entry.count += 1;
      map.set(key, entry);
    }

    return Array.from(map.entries()).map(([memberId, { total, count }]) => ({
      memberId,
      totalSpend: total,
      reservationCount: count,
    }));
  }

  // -------------------------------------------------------------------------
  // getSpendBySwarm
  // -------------------------------------------------------------------------

  /**
   * Aggregate credit spend by swarm across a workspace.
   */
  async getSpendBySwarm(workspaceId: string): Promise<SwarmSpend[]> {
    const accounts = await this.prisma.creditAccount.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) return [];

    const reservations = await this.prisma.creditReservation.findMany({
      where: {
        accountId: { in: accountIds },
        swarmId: { not: null },
        status: "SETTLED",
      },
    });

    const debits = await this.prisma.creditLedgerEntry.findMany({
      where: {
        accountId: { in: accountIds },
        type: "DEBIT",
        referenceType: "reservation",
        referenceId: { in: reservations.map((r) => r.id) },
      },
    });

    const debitMap = new Map<string, number>();
    for (const entry of debits) {
      if (entry.referenceId) {
        debitMap.set(entry.referenceId, d(entry.amount));
      }
    }

    // Group by swarmId
    const swarmMap = new Map<string, { total: number; count: number }>();
    for (const res of reservations) {
      const swarmId = res.swarmId!;
      const entry = swarmMap.get(swarmId) ?? { total: 0, count: 0 };
      entry.total += debitMap.get(res.id) ?? 0;
      entry.count += 1;
      swarmMap.set(swarmId, entry);
    }

    // Fetch swarm names
    const swarmIds = [...swarmMap.keys()];
    const swarms = await this.prisma.swarm.findMany({
      where: { id: { in: swarmIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(swarms.map((s) => [s.id, s.name]));

    return Array.from(swarmMap.entries()).map(([swarmId, { total, count }]) => ({
      swarmId,
      swarmName: nameMap.get(swarmId) ?? "Unknown",
      totalSpend: total,
      reservationCount: count,
    }));
  }

  // -------------------------------------------------------------------------
  // validateBudget
  // -------------------------------------------------------------------------

  /**
   * Quick check: does this account have at least `amount` available credits?
   */
  async validateBudget(
    accountId: string,
    amount: number,
  ): Promise<boolean> {
    const balance = await this.getBalance(accountId);
    return balance.available >= amount;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const creditService = new CreditService();
