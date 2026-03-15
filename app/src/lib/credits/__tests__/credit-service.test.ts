// ---------------------------------------------------------------------------
// Credit Service — Unit Tests
// ---------------------------------------------------------------------------
// Tests the core reserve / settle / release / topUp / getBalance flow.
// Uses a fully mocked Prisma client so no database is needed.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreditService } from "../credit-service";
import {
  InsufficientCreditsError,
  AlreadySettledError,
  type CreditLedgerEntry,
} from "../types";
import {
  createMockDb,
  createTestAccount,
  createTestReservation,
  createTestLedgerEntry,
  MockDecimal,
  resetIdCounter,
  assertLedgerInvariant,
} from "./helpers";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockDb: ReturnType<typeof createMockDb>;
let service: CreditService;

beforeEach(() => {
  resetIdCounter();
  mockDb = createMockDb();
  // Inject the mock client as the Prisma instance
  service = new CreditService(mockDb as unknown as any);
});

// ---------------------------------------------------------------------------
// reserveCredits
// ---------------------------------------------------------------------------

describe("reserveCredits", () => {
  it("creates a reservation, updates reserved balance, and writes a RESERVE ledger entry", async () => {
    const account = createTestAccount(1000, 0);

    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);
    mockDb.creditAccount.updateMany.mockResolvedValue({ count: 1 });

    const reservation = createTestReservation("PENDING", 100, {
      accountId: account.id,
    });
    mockDb.creditReservation.create.mockResolvedValue(reservation);

    const ledgerEntry = createTestLedgerEntry("RESERVE", 100, {
      accountId: account.id,
      referenceId: reservation.id,
    });
    mockDb.creditLedgerEntry.create.mockResolvedValue(ledgerEntry);

    const result = await service.reserveCredits(account.id, 100, {
      description: "Test reservation",
      runId: "run_1",
    });

    // Verify reservation was created
    expect(result.id).toBe(reservation.id);
    expect(result.amount).toBe(100);
    expect(result.status).toBe("PENDING");

    // Verify account was looked up
    expect(mockDb.creditAccount.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: account.id },
    });

    // Verify reserved balance was incremented
    expect(mockDb.creditAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: account.id,
        balance: account.balance,
        reservedBalance: account.reservedBalance,
      },
      data: { reservedBalance: { increment: 100 } },
    });

    // Verify reservation row was created
    expect(mockDb.creditReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: account.id,
        amount: 100,
        status: "PENDING",
        runId: "run_1",
      }),
    });

    // Verify ledger entry was written
    expect(mockDb.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: account.id,
        type: "RESERVE",
        amount: 100,
        referenceType: "reservation",
        referenceId: reservation.id,
      }),
    });
  });

  it("throws InsufficientCreditsError when balance is insufficient", async () => {
    const account = createTestAccount(50, 0);
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    await expect(
      service.reserveCredits(account.id, 100),
    ).rejects.toThrow(InsufficientCreditsError);

    // Verify no reservation or ledger entry was created
    expect(mockDb.creditReservation.create).not.toHaveBeenCalled();
    expect(mockDb.creditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError when available balance (balance - reserved) is insufficient", async () => {
    // Balance is 100 but 80 is already reserved, so only 20 available
    const account = createTestAccount(100, 80);
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    await expect(
      service.reserveCredits(account.id, 50),
    ).rejects.toThrow(InsufficientCreditsError);

    const error = await service
      .reserveCredits(account.id, 50)
      .catch((e) => e);
    expect(error).toBeInstanceOf(InsufficientCreditsError);
    expect(error.requested).toBe(50);
    expect(error.available).toBe(20);
  });

  it("throws when amount is zero or negative", async () => {
    await expect(
      service.reserveCredits("acct_1", 0),
    ).rejects.toThrow("Reservation amount must be positive");

    await expect(
      service.reserveCredits("acct_1", -10),
    ).rejects.toThrow("Reservation amount must be positive");
  });

  it("correctly passes swarmId and runId to the reservation", async () => {
    const account = createTestAccount(1000, 0);
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);
    mockDb.creditAccount.updateMany.mockResolvedValue({ count: 1 });

    const reservation = createTestReservation("PENDING", 50, {
      accountId: account.id,
      swarmId: "swarm_1",
      runId: "run_1",
    });
    mockDb.creditReservation.create.mockResolvedValue(reservation);
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RESERVE", 50),
    );

    await service.reserveCredits(account.id, 50, {
      swarmId: "swarm_1",
      runId: "run_1",
    });

    expect(mockDb.creditReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        swarmId: "swarm_1",
        runId: "run_1",
      }),
    });
  });

  it("retries on an optimistic concurrency conflict before succeeding", async () => {
    const account = createTestAccount(1000, 0, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);
    mockDb.creditAccount.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const reservation = createTestReservation("PENDING", 100, {
      accountId: account.id,
    });
    mockDb.creditReservation.create.mockResolvedValue(reservation);
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RESERVE", 100, {
        accountId: account.id,
        referenceId: reservation.id,
      }),
    );

    const result = await service.reserveCredits(account.id, 100);

    expect(result.id).toBe(reservation.id);
    expect(mockDb.creditAccount.findUniqueOrThrow).toHaveBeenCalledTimes(2);
    expect(mockDb.creditAccount.updateMany).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a conflicting update leaves insufficient available balance", async () => {
    mockDb.creditAccount.findUniqueOrThrow
      .mockResolvedValueOnce(createTestAccount(100, 0, { id: "acct_1" }))
      .mockResolvedValueOnce(createTestAccount(100, 80, { id: "acct_1" }));
    mockDb.creditAccount.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.reserveCredits("acct_1", 50),
    ).rejects.toThrow(InsufficientCreditsError);

    expect(mockDb.creditReservation.create).not.toHaveBeenCalled();
    expect(mockDb.creditLedgerEntry.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// settleReservation
// ---------------------------------------------------------------------------

describe("settleReservation", () => {
  it("debits actual amount, releases remainder, writes 2 ledger entries", async () => {
    const reservation = createTestReservation("PENDING", 100, {
      accountId: "acct_1",
    });
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "SETTLED",
      settledAt: new Date(),
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(900, 0, { id: "acct_1" }),
    );

    // Two ledger entries: DEBIT and RELEASE
    const debitEntry = createTestLedgerEntry("DEBIT", 60, { accountId: "acct_1" });
    const releaseEntry = createTestLedgerEntry("RELEASE", 40, { accountId: "acct_1" });
    mockDb.creditLedgerEntry.create
      .mockResolvedValueOnce(debitEntry)
      .mockResolvedValueOnce(releaseEntry);

    const result = await service.settleReservation(reservation.id, 60);

    expect(result.debited).toBe(60);
    expect(result.released).toBe(40);
    expect(result.ledgerEntryIds).toHaveLength(2);
    expect(result.ledgerEntryIds).toContain(debitEntry.id);
    expect(result.ledgerEntryIds).toContain(releaseEntry.id);

    // Verify reservation was marked SETTLED
    expect(mockDb.creditReservation.update).toHaveBeenCalledWith({
      where: { id: reservation.id },
      data: expect.objectContaining({ status: "SETTLED" }),
    });

    // Verify balance was decremented by debited amount and reservedBalance
    // was decremented by full reserved amount
    expect(mockDb.creditAccount.update).toHaveBeenCalledWith({
      where: { id: "acct_1" },
      data: {
        balance: { decrement: 60 },
        reservedBalance: { decrement: 100 },
      },
    });

    // Verify DEBIT ledger entry
    expect(mockDb.creditLedgerEntry.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: "DEBIT",
        amount: 60,
        referenceId: reservation.id,
      }),
    });

    // Verify RELEASE ledger entry
    expect(mockDb.creditLedgerEntry.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        type: "RELEASE",
        amount: 40,
        referenceId: reservation.id,
      }),
    });
  });

  it("only debits reserved amount when actual > reserved (no overdraft)", async () => {
    const reservation = createTestReservation("PENDING", 50, {
      accountId: "acct_1",
    });
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "SETTLED",
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(950, 0, { id: "acct_1" }),
    );

    const debitEntry = createTestLedgerEntry("DEBIT", 50, { accountId: "acct_1" });
    mockDb.creditLedgerEntry.create.mockResolvedValueOnce(debitEntry);

    // Request 200 but only 50 was reserved
    const result = await service.settleReservation(reservation.id, 200);

    // Debited should be clamped to reserved amount
    expect(result.debited).toBe(50);
    expect(result.released).toBe(0);
    // Only one ledger entry (DEBIT), no RELEASE since remainder is 0
    expect(result.ledgerEntryIds).toHaveLength(1);

    expect(mockDb.creditAccount.update).toHaveBeenCalledWith({
      where: { id: "acct_1" },
      data: {
        balance: { decrement: 50 },
        reservedBalance: { decrement: 50 },
      },
    });
  });

  it("writes only a DEBIT entry when actual equals reserved (no remainder)", async () => {
    const reservation = createTestReservation("PENDING", 75, {
      accountId: "acct_1",
    });
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "SETTLED",
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(925, 0, { id: "acct_1" }),
    );

    const debitEntry = createTestLedgerEntry("DEBIT", 75);
    mockDb.creditLedgerEntry.create.mockResolvedValueOnce(debitEntry);

    const result = await service.settleReservation(reservation.id, 75);

    expect(result.debited).toBe(75);
    expect(result.released).toBe(0);
    expect(result.ledgerEntryIds).toHaveLength(1);
    // Only one create call (DEBIT), no RELEASE
    expect(mockDb.creditLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("handles zero actual amount (full release via settlement)", async () => {
    const reservation = createTestReservation("PENDING", 100, {
      accountId: "acct_1",
    });
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "SETTLED",
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(1000, 0, { id: "acct_1" }),
    );

    const debitEntry = createTestLedgerEntry("DEBIT", 0);
    const releaseEntry = createTestLedgerEntry("RELEASE", 100);
    mockDb.creditLedgerEntry.create
      .mockResolvedValueOnce(debitEntry)
      .mockResolvedValueOnce(releaseEntry);

    const result = await service.settleReservation(reservation.id, 0);

    expect(result.debited).toBe(0);
    expect(result.released).toBe(100);
  });

  it("throws AlreadySettledError when reservation is already SETTLED", async () => {
    const reservation = createTestReservation("SETTLED", 100);
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);

    await expect(
      service.settleReservation(reservation.id, 50),
    ).rejects.toThrow(AlreadySettledError);
  });

  it("throws AlreadySettledError when reservation is already RELEASED", async () => {
    const reservation = createTestReservation("RELEASED", 100);
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);

    await expect(
      service.settleReservation(reservation.id, 50),
    ).rejects.toThrow(AlreadySettledError);
  });

  it("throws when settlement amount is negative", async () => {
    await expect(
      service.settleReservation("res_1", -10),
    ).rejects.toThrow("Settlement amount must be non-negative");
  });
});

// ---------------------------------------------------------------------------
// releaseReservation
// ---------------------------------------------------------------------------

describe("releaseReservation", () => {
  it("releases full amount and writes a RELEASE ledger entry", async () => {
    const reservation = createTestReservation("PENDING", 200, {
      accountId: "acct_1",
    });
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "RELEASED",
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(1000, 0, { id: "acct_1" }),
    );
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RELEASE", 200),
    );

    await service.releaseReservation(reservation.id);

    // Verify reservation was marked RELEASED
    expect(mockDb.creditReservation.update).toHaveBeenCalledWith({
      where: { id: reservation.id },
      data: expect.objectContaining({ status: "RELEASED" }),
    });

    // Verify reserved balance was decremented
    expect(mockDb.creditAccount.update).toHaveBeenCalledWith({
      where: { id: "acct_1" },
      data: { reservedBalance: { decrement: 200 } },
    });

    // Verify RELEASE ledger entry was written
    expect(mockDb.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "acct_1",
        type: "RELEASE",
        amount: 200,
        referenceType: "reservation",
        referenceId: reservation.id,
      }),
    });
  });

  it("throws AlreadySettledError when reservation is already SETTLED", async () => {
    const reservation = createTestReservation("SETTLED", 100);
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);

    await expect(
      service.releaseReservation(reservation.id),
    ).rejects.toThrow(AlreadySettledError);

    const error = await service
      .releaseReservation(reservation.id)
      .catch((e) => e);
    expect(error.reservationId).toBe(reservation.id);
    expect(error.currentStatus).toBe("SETTLED");
  });

  it("throws AlreadySettledError when reservation is already RELEASED", async () => {
    const reservation = createTestReservation("RELEASED", 100);
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);

    await expect(
      service.releaseReservation(reservation.id),
    ).rejects.toThrow(AlreadySettledError);
  });
});

// ---------------------------------------------------------------------------
// topUp
// ---------------------------------------------------------------------------

describe("topUp", () => {
  it("increases balance and writes a TOPUP ledger entry", async () => {
    const account = createTestAccount(500, 0, { id: "acct_1" });
    mockDb.creditAccount.update.mockResolvedValue({
      ...account,
      balance: new MockDecimal(1000),
    });
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("TOPUP", 500, { accountId: "acct_1" }),
    );

    await service.topUp("acct_1", 500, "Monthly refill");

    expect(mockDb.creditAccount.update).toHaveBeenCalledWith({
      where: { id: "acct_1" },
      data: { balance: { increment: 500 } },
    });

    expect(mockDb.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "acct_1",
        type: "TOPUP",
        amount: 500,
        description: "Monthly refill",
      }),
    });
  });

  it("throws when top-up amount is zero or negative", async () => {
    await expect(
      service.topUp("acct_1", 0, "bad"),
    ).rejects.toThrow("Top-up amount must be positive");

    await expect(
      service.topUp("acct_1", -100, "bad"),
    ).rejects.toThrow("Top-up amount must be positive");
  });
});

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe("getBalance", () => {
  it("returns { available, reserved, total } correctly", async () => {
    const account = createTestAccount(1000, 300, {
      id: "acct_1",
      bucket: "TESTING",
    });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const balance = await service.getBalance("acct_1");

    expect(balance.accountId).toBe("acct_1");
    expect(balance.bucket).toBe("TESTING");
    expect(balance.total).toBe(1000);
    expect(balance.reserved).toBe(300);
    expect(balance.available).toBe(700);
  });

  it("returns zero available when fully reserved", async () => {
    const account = createTestAccount(500, 500, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const balance = await service.getBalance("acct_1");

    expect(balance.available).toBe(0);
    expect(balance.reserved).toBe(500);
    expect(balance.total).toBe(500);
  });

  it("returns zero everything for a fresh account", async () => {
    const account = createTestAccount(0, 0, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const balance = await service.getBalance("acct_1");

    expect(balance.available).toBe(0);
    expect(balance.reserved).toBe(0);
    expect(balance.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Concurrent reservations (race condition safety)
// ---------------------------------------------------------------------------

describe("concurrent reservations", () => {
  it("uses $transaction to prevent race conditions with Promise.all", async () => {
    // This test verifies that reserveCredits calls go through $transaction.
    // In a real DB, the transaction provides serializable isolation.
    // Here we verify the transaction was invoked for each concurrent call.

    const account = createTestAccount(1000, 0, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);
    mockDb.creditAccount.updateMany.mockResolvedValue({ count: 1 });

    let reservationCounter = 0;
    mockDb.creditReservation.create.mockImplementation(async () => {
      reservationCounter++;
      return createTestReservation("PENDING", 100, {
        id: `res_${reservationCounter}`,
        accountId: "acct_1",
      });
    });
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RESERVE", 100),
    );

    // Fire 5 concurrent reservations
    const promises = Array.from({ length: 5 }, (_, i) =>
      service.reserveCredits("acct_1", 100, { description: `Concurrent ${i}` }),
    );

    const results = await Promise.all(promises);

    // All 5 should succeed (mock doesn't actually enforce balance)
    expect(results).toHaveLength(5);

    // Each call should have gone through $transaction
    expect(mockDb.$transaction).toHaveBeenCalledTimes(5);
  });

  it("rejects some reservations when total exceeds balance", async () => {
    // Simulate a scenario where the first 3 succeed but the last 2 fail.
    // We do this by making findUniqueOrThrow return decreasing available balance.
    let callCount = 0;
    mockDb.creditAccount.findUniqueOrThrow.mockImplementation(async () => {
      callCount++;
      // First 3 calls see enough balance, last 2 don't
      const reserved = (callCount - 1) * 100;
      return createTestAccount(300, reserved, { id: "acct_1" });
    });

    mockDb.creditAccount.updateMany.mockResolvedValue({ count: 1 });

    let resCounter = 0;
    mockDb.creditReservation.create.mockImplementation(async () => {
      resCounter++;
      return createTestReservation("PENDING", 100, {
        id: `res_${resCounter}`,
        accountId: "acct_1",
      });
    });
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RESERVE", 100),
    );

    const promises = Array.from({ length: 5 }, (_, i) =>
      service
        .reserveCredits("acct_1", 100, { description: `Concurrent ${i}` })
        .then((r) => ({ success: true as const, reservation: r }))
        .catch((e) => ({ success: false as const, error: e })),
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes).toHaveLength(3);
    expect(failures).toHaveLength(2);

    for (const failure of failures) {
      if (!failure.success) {
        expect(failure.error).toBeInstanceOf(InsufficientCreditsError);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Ledger invariant
// ---------------------------------------------------------------------------

describe("ledger invariant: sum(TOPUP) - sum(DEBIT) = balance", () => {
  it("holds after a topUp -> reserve -> settle cycle", () => {
    // Simulate a sequence of operations and verify the invariant
    const entries: CreditLedgerEntry[] = [
      {
        id: "e1",
        accountId: "acct_1",
        type: "TOPUP",
        amount: 1000,
        description: "Initial topup",
        referenceType: "topup",
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        accountId: "acct_1",
        type: "RESERVE",
        amount: 300,
        description: "Reservation",
        referenceType: "reservation",
        referenceId: "res_1",
        createdAt: new Date(),
      },
      {
        id: "e3",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 200,
        description: "Settlement debit",
        referenceType: "reservation",
        referenceId: "res_1",
        createdAt: new Date(),
      },
      {
        id: "e4",
        accountId: "acct_1",
        type: "RELEASE",
        amount: 100,
        description: "Settlement release",
        referenceType: "reservation",
        referenceId: "res_1",
        createdAt: new Date(),
      },
    ];

    // After: topup 1000, debit 200 -> balance should be 800
    expect(() => assertLedgerInvariant(entries, 800)).not.toThrow();
  });

  it("holds after multiple topups and settlements", () => {
    const entries: CreditLedgerEntry[] = [
      {
        id: "e1",
        accountId: "acct_1",
        type: "TOPUP",
        amount: 500,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        accountId: "acct_1",
        type: "TOPUP",
        amount: 300,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e3",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 150,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e4",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 100,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e5",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 50,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
    ];

    // 500 + 300 - 150 - 100 - 50 = 500
    expect(() => assertLedgerInvariant(entries, 500)).not.toThrow();
  });

  it("throws when debits exceed topups (negative balance)", () => {
    const entries: CreditLedgerEntry[] = [
      {
        id: "e1",
        accountId: "acct_1",
        type: "TOPUP",
        amount: 100,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 200,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
    ];

    expect(() => assertLedgerInvariant(entries)).toThrow(
      "computed balance is negative",
    );
  });

  it("throws when expected balance does not match computed", () => {
    const entries: CreditLedgerEntry[] = [
      {
        id: "e1",
        accountId: "acct_1",
        type: "TOPUP",
        amount: 1000,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        accountId: "acct_1",
        type: "DEBIT",
        amount: 300,
        description: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
      },
    ];

    // Actual balance is 700, but we claim 800
    expect(() => assertLedgerInvariant(entries, 800)).toThrow(
      "Ledger invariant violated",
    );
  });
});

// ---------------------------------------------------------------------------
// validateBudget
// ---------------------------------------------------------------------------

describe("validateBudget", () => {
  it("returns true when balance is sufficient", async () => {
    const account = createTestAccount(1000, 200, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const result = await service.validateBudget("acct_1", 500);
    expect(result).toBe(true);
  });

  it("returns false when balance is insufficient", async () => {
    const account = createTestAccount(1000, 800, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const result = await service.validateBudget("acct_1", 300);
    expect(result).toBe(false);
  });

  it("returns true when amount is exactly equal to available", async () => {
    const account = createTestAccount(1000, 500, { id: "acct_1" });
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(account);

    const result = await service.validateBudget("acct_1", 500);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getLedger
// ---------------------------------------------------------------------------

describe("getLedger", () => {
  it("returns paginated entries with nextCursor", async () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      createTestLedgerEntry("DEBIT", 10 * (i + 1), {
        id: `led_${i}`,
        accountId: "acct_1",
      }),
    );

    // Return 3 entries (limit+1 to signal more pages)
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(entries);
    mockDb.creditLedgerEntry.count.mockResolvedValue(10);

    const result = await service.getLedger("acct_1", { limit: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBe("led_1");
    expect(result.totalCount).toBe(10);
  });

  it("returns null nextCursor when all entries fit", async () => {
    const entries = [
      createTestLedgerEntry("TOPUP", 100, { id: "led_0", accountId: "acct_1" }),
    ];

    mockDb.creditLedgerEntry.findMany.mockResolvedValue(entries);
    mockDb.creditLedgerEntry.count.mockResolvedValue(1);

    const result = await service.getLedger("acct_1", { limit: 50 });

    expect(result.entries).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(result.totalCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle scenario
// ---------------------------------------------------------------------------

describe("full lifecycle: topUp -> reserve -> settle -> getBalance", () => {
  it("tracks credits correctly through a complete cycle", async () => {
    // This test verifies the logical flow, not actual DB state
    // (since we are using mocks).

    const accountId = "acct_lifecycle";

    // Step 1: TopUp
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(1000, 0, { id: accountId }),
    );
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("TOPUP", 1000),
    );
    await service.topUp(accountId, 1000, "Initial load");
    expect(mockDb.$transaction).toHaveBeenCalled();

    // Step 2: Reserve 300
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(
      createTestAccount(1000, 0, { id: accountId }),
    );
    mockDb.creditAccount.updateMany.mockReset();
    mockDb.creditAccount.updateMany.mockResolvedValueOnce({ count: 1 });
    const reservation = createTestReservation("PENDING", 300, {
      id: "res_lifecycle",
      accountId,
    });
    mockDb.creditReservation.create.mockResolvedValue(reservation);
    mockDb.creditLedgerEntry.create.mockResolvedValue(
      createTestLedgerEntry("RESERVE", 300),
    );
    const res = await service.reserveCredits(accountId, 300);
    expect(res.amount).toBe(300);

    // Step 3: Settle with actual = 200
    mockDb.creditReservation.findUniqueOrThrow.mockResolvedValue(reservation);
    mockDb.creditReservation.update.mockResolvedValue({
      ...reservation,
      status: "SETTLED",
    });
    mockDb.creditAccount.update.mockResolvedValue(
      createTestAccount(800, 0, { id: accountId }),
    );
    mockDb.creditLedgerEntry.create
      .mockResolvedValueOnce(createTestLedgerEntry("DEBIT", 200))
      .mockResolvedValueOnce(createTestLedgerEntry("RELEASE", 100));

    const settlement = await service.settleReservation("res_lifecycle", 200);
    expect(settlement.debited).toBe(200);
    expect(settlement.released).toBe(100);

    // Step 4: Get balance (would show 800 available in real DB)
    mockDb.creditAccount.findUniqueOrThrow.mockResolvedValue(
      createTestAccount(800, 0, { id: accountId }),
    );
    const balance = await service.getBalance(accountId);
    expect(balance.total).toBe(800);
    expect(balance.available).toBe(800);
    expect(balance.reserved).toBe(0);
  });
});
