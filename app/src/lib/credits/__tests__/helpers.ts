// ---------------------------------------------------------------------------
// Credit Test Helpers
// ---------------------------------------------------------------------------
// Factories, mock builders, and assertion utilities for credit system tests.
// ---------------------------------------------------------------------------

import { vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type {
  CreditLedgerEntry,
  CreditReservation,
} from "../types";

// ---------------------------------------------------------------------------
// Types for mocked Prisma models
// ---------------------------------------------------------------------------

/** Shape of a mocked CreditAccount row (Prisma return type). */
export interface MockCreditAccount {
  id: string;
  workspaceId: string;
  bucket: "TESTING" | "LIVE_OPS";
  balance: MockDecimal;
  reservedBalance: MockDecimal;
}

/** Shape of a mocked CreditReservation row (Prisma return type). */
export interface MockCreditReservationRow {
  id: string;
  accountId: string;
  amount: MockDecimal;
  status: "PENDING" | "SETTLED" | "RELEASED";
  runId: string | null;
  swarmId: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

/** Shape of a mocked CreditLedgerEntry row. */
export interface MockCreditLedgerEntryRow {
  id: string;
  accountId: string;
  type: "RESERVE" | "DEBIT" | "RELEASE" | "TOPUP";
  amount: MockDecimal;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Mock Decimal — mimics Prisma.Decimal.toNumber()
// ---------------------------------------------------------------------------

export class MockDecimal {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  toNumber(): number {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }

  /** Allow arithmetic comparisons via valueOf(). */
  valueOf(): number {
    return this.value;
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

let idCounter = 0;

function nextId(prefix: string = "test"): string {
  return `${prefix}_${++idCounter}_${Date.now()}`;
}

/** Reset the id counter (call in beforeEach). */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Create a mock CreditAccount with the given balance and reserved amount.
 */
export function createTestAccount(
  balance: number,
  reserved: number = 0,
  overrides: Partial<MockCreditAccount> = {},
): MockCreditAccount {
  return {
    id: nextId("acct"),
    workspaceId: nextId("ws"),
    bucket: "TESTING",
    balance: new MockDecimal(balance),
    reservedBalance: new MockDecimal(reserved),
    ...overrides,
  };
}

/**
 * Create a mock CreditReservation with the given status and amount.
 */
export function createTestReservation(
  status: "PENDING" | "SETTLED" | "RELEASED",
  amount: number,
  overrides: Partial<MockCreditReservationRow> = {},
): MockCreditReservationRow {
  return {
    id: nextId("res"),
    accountId: nextId("acct"),
    amount: new MockDecimal(amount),
    status,
    runId: null,
    swarmId: null,
    createdAt: new Date(),
    settledAt: status === "PENDING" ? null : new Date(),
    ...overrides,
  };
}

/**
 * Create a mock CreditLedgerEntry.
 */
export function createTestLedgerEntry(
  type: "RESERVE" | "DEBIT" | "RELEASE" | "TOPUP",
  amount: number,
  overrides: Partial<MockCreditLedgerEntryRow> = {},
): MockCreditLedgerEntryRow {
  return {
    id: nextId("led"),
    accountId: nextId("acct"),
    type,
    amount: new MockDecimal(amount),
    description: null,
    referenceType: null,
    referenceId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ledger Invariant Assertion
// ---------------------------------------------------------------------------

/**
 * Assert the fundamental ledger invariant:
 *
 *   sum(TOPUP) - sum(DEBIT) = final balance
 *
 * RESERVE and RELEASE entries do not affect the balance; they only move
 * credits between available and reserved.  So the invariant is:
 *
 *   balance = sum(TOPUP amounts) - sum(DEBIT amounts)
 *
 * @param entries - All ledger entries for a single account.
 * @param expectedBalance - The expected current balance.
 * @throws If the invariant does not hold.
 */
export function assertLedgerInvariant(
  entries: CreditLedgerEntry[],
  expectedBalance?: number,
): void {
  let topupSum = 0;
  let debitSum = 0;

  for (const entry of entries) {
    switch (entry.type) {
      case "TOPUP":
        topupSum += entry.amount;
        break;
      case "DEBIT":
        debitSum += entry.amount;
        break;
      // RESERVE and RELEASE do not change the balance
      case "RESERVE":
      case "RELEASE":
        break;
    }
  }

  const computedBalance = round4(topupSum - debitSum);

  if (expectedBalance !== undefined) {
    const rounded = round4(expectedBalance);
    if (Math.abs(computedBalance - rounded) > 0.0001) {
      throw new Error(
        `Ledger invariant violated: sum(TOPUP)=${topupSum} - sum(DEBIT)=${debitSum} ` +
          `= ${computedBalance}, expected balance ${rounded}`,
      );
    }
  }

  // Sanity: balance should never be negative unless we explicitly allow it
  // (for now, no negative balances)
  if (computedBalance < -0.0001) {
    throw new Error(
      `Ledger invariant violated: computed balance is negative (${computedBalance})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Mock Prisma Client Builder
// ---------------------------------------------------------------------------

/**
 * Create a mocked PrismaClient-like object for unit testing.
 *
 * Each model delegate (creditAccount, creditReservation, creditLedgerEntry, etc.)
 * is a collection of vi.fn() mocks.  Tests set return values per-test.
 *
 * The `$transaction` mock executes the callback with the same mock client,
 * simulating Prisma interactive transactions.
 */
export function createMockDb() {
  const mockCreditAccount = {
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };

  const mockCreditReservation = {
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  };

  const mockCreditLedgerEntry = {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  };

  const mockSwarm = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
  };

  const mockRun = {
    findUnique: vi.fn(),
  };

  const mockSwarmChild = {
    findMany: vi.fn().mockResolvedValue([]),
  };

  const mockClient = {
    creditAccount: mockCreditAccount,
    creditReservation: mockCreditReservation,
    creditLedgerEntry: mockCreditLedgerEntry,
    swarm: mockSwarm,
    run: mockRun,
    swarmChild: mockSwarmChild,
    $transaction: vi.fn(),
  };

  // $transaction executes the callback passing the client itself as the
  // transactional prisma instance (since all delegates are already mocked).
  mockClient.$transaction.mockImplementation(async (fn: (tx: typeof mockClient) => Promise<unknown>) => {
    return fn(mockClient);
  });

  return mockClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}
