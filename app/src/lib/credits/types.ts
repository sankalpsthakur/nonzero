// ---------------------------------------------------------------------------
// Credit System – Type Definitions
// ---------------------------------------------------------------------------
// These types define the shapes used by the credit service, metering engine,
// and policy enforcement layer. They align with the Prisma schema models
// CreditAccount, CreditLedgerEntry, and CreditReservation.
// ---------------------------------------------------------------------------

import type {
  CreditBucket as PrismaCreditBucket,
  CreditLedgerType as PrismaCreditLedgerType,
  CreditReservationStatus as PrismaCreditReservationStatus,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Re-exports from Prisma (canonical source of truth for DB enums)
// ---------------------------------------------------------------------------

export type CreditBucket = PrismaCreditBucket;
export type CreditLedgerType = PrismaCreditLedgerType;
export type CreditReservationStatus = PrismaCreditReservationStatus;

// ---------------------------------------------------------------------------
// Balance & Account
// ---------------------------------------------------------------------------

/** The available/reserved/total view of a credit account. */
export interface CreditBalance {
  accountId: string;
  bucket: CreditBucket;
  /** Balance available for new reservations (balance - reservedBalance). */
  available: number;
  /** Currently reserved (held for pending operations). */
  reserved: number;
  /** Total balance on the account (available + reserved). */
  total: number;
}

// ---------------------------------------------------------------------------
// Reservation
// ---------------------------------------------------------------------------

/** Parameters for creating a new credit reservation. */
export interface ReservationParams {
  /** What this reservation is for. */
  description?: string;
  /** Associated run ID, if any. */
  runId?: string;
  /** Associated swarm ID, if any. */
  swarmId?: string;
  /** The member who initiated this reservation. */
  memberId?: string;
}

/** A credit reservation as returned by the service. */
export interface CreditReservation {
  id: string;
  accountId: string;
  amount: number;
  status: CreditReservationStatus;
  runId: string | null;
  swarmId: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

/** Result of settling a reservation. */
export interface SettlementResult {
  reservationId: string;
  /** Amount actually debited from the account. */
  debited: number;
  /** Amount released back to available balance. */
  released: number;
  /** Ledger entry IDs created by the settlement. */
  ledgerEntryIds: string[];
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/** A single credit ledger entry as returned by the service. */
export interface CreditLedgerEntry {
  id: string;
  accountId: string;
  type: CreditLedgerType;
  amount: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}

/** Query parameters for fetching ledger entries. */
export interface LedgerQuery {
  /** Filter by entry types. */
  types?: CreditLedgerType[];
  /** Return entries after this date. */
  after?: Date;
  /** Return entries before this date. */
  before?: Date;
  /** Pagination cursor (entry ID). */
  cursor?: string;
  /** Page size. */
  limit?: number;
}

/** Paginated ledger response. */
export interface PaginatedLedger {
  entries: CreditLedgerEntry[];
  /** Cursor for the next page, or null if no more. */
  nextCursor: string | null;
  /** Total count of matching entries (without pagination). */
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Spend Analytics
// ---------------------------------------------------------------------------

/** Credit spend attributed to a workspace member. */
export interface MemberSpend {
  memberId: string;
  totalSpend: number;
  reservationCount: number;
}

/** Credit spend attributed to a swarm. */
export interface SwarmSpend {
  swarmId: string;
  swarmName: string;
  totalSpend: number;
  reservationCount: number;
}

// ---------------------------------------------------------------------------
// Metering
// ---------------------------------------------------------------------------

/** Raw usage metrics for a single run, used to compute credit cost. */
export interface RunUsage {
  /** Duration the sandbox was alive, in seconds. */
  sandboxSeconds: number;
  /** Total artifact storage in bytes. */
  artifactStorageBytes: number;
  /** Number of swarm children spawned by this run. */
  swarmChildrenSpawned: number;
  /** Duration of shadow-live replay, in hours. */
  replayDurationHours: number;
}

/** Itemised credit cost breakdown for a run. */
export interface CreditCost {
  sandboxCredits: number;
  artifactStorageCredits: number;
  swarmChildrenCredits: number;
  replayCredits: number;
  totalCredits: number;
}

/** Pre-launch estimate for a swarm run. */
export interface CreditEstimate {
  /** Estimated total credits. */
  estimated: number;
  /** Breakdown by cost category. */
  breakdown: CreditCost;
  /** Whether the workspace has sufficient credits. */
  affordable: boolean;
  /** Available balance at time of estimate. */
  availableBalance: number;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Result of running credit policy checks. */
export interface PolicyCheckResult {
  /** Whether the action is allowed. */
  allowed: boolean;
  /** Whether approval is required before proceeding. */
  requiresApproval: boolean;
  /** Individual policy violations or warnings. */
  violations: PolicyViolation[];
}

/** A single policy violation or warning. */
export interface PolicyViolation {
  /** Policy that was triggered. */
  policyName: string;
  /** Whether this is a hard block or a soft warning. */
  severity: "block" | "warn";
  /** Human-readable message. */
  message: string;
  /** The threshold that was exceeded. */
  threshold: number;
  /** The actual value that triggered the violation. */
  actual: number;
}

/** Workspace-level credit policy configuration. */
export interface CreditPolicyConfig {
  /** Per-member monthly soft limit (credits). Exceeding triggers a warning. */
  memberMonthlySoftLimit: number;
  /** Per-swarm hard ceiling (credits). Exceeding blocks the launch. */
  swarmHardCeiling: number;
  /** Credit amount above which approval is required. */
  approvalThreshold: number;
}

/** Default policy config used when no workspace override exists. */
export const DEFAULT_CREDIT_POLICY: CreditPolicyConfig = {
  memberMonthlySoftLimit: 1000,
  swarmHardCeiling: 5000,
  approvalThreshold: 500,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when an account has insufficient available credits for a reservation. */
export class InsufficientCreditsError extends Error {
  public readonly accountId: string;
  public readonly requested: number;
  public readonly available: number;

  constructor(accountId: string, requested: number, available: number) {
    super(
      `Insufficient credits on account ${accountId}: ` +
        `requested ${requested}, available ${available}`
    );
    this.name = "InsufficientCreditsError";
    this.accountId = accountId;
    this.requested = requested;
    this.available = available;
  }
}

/** Thrown when attempting to release or re-settle an already-settled reservation. */
export class AlreadySettledError extends Error {
  public readonly reservationId: string;
  public readonly currentStatus: CreditReservationStatus;

  constructor(reservationId: string, currentStatus: CreditReservationStatus) {
    super(
      `Reservation ${reservationId} cannot be modified: ` +
        `current status is ${currentStatus}`
    );
    this.name = "AlreadySettledError";
    this.reservationId = reservationId;
    this.currentStatus = currentStatus;
  }
}
