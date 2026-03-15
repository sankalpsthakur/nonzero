// ---------------------------------------------------------------------------
// Credit Policies — Unit Tests
// ---------------------------------------------------------------------------
// Tests the policy enforcement layer that gates credit reservations.
// Uses a mocked Prisma client.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from "vitest";
import { CreditPolicyEngine } from "../policies";
import {
  DEFAULT_CREDIT_POLICY,
  type CreditPolicyConfig,
} from "../types";
import {
  createMockDb,
  createTestReservation,
  createTestLedgerEntry,
  MockDecimal,
  resetIdCounter,
} from "./helpers";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockDb: ReturnType<typeof createMockDb>;
let engine: CreditPolicyEngine;

const defaultPolicy: CreditPolicyConfig = {
  memberMonthlySoftLimit: 1000,
  swarmHardCeiling: 5000,
  approvalThreshold: 500,
};

beforeEach(() => {
  resetIdCounter();
  mockDb = createMockDb();
  engine = new CreditPolicyEngine(
    mockDb as unknown as any,
    defaultPolicy,
  );
});

// ---------------------------------------------------------------------------
// Per-member monthly soft limit
// ---------------------------------------------------------------------------

describe("per-member soft limit", () => {
  it("passes when member spend is well below limit", async () => {
    // No debits for this member
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100,
      "run",
    );

    // Amount (100) < threshold (500) so no approval needed
    // Member spend (0 + 100 = 100) < soft limit (1000) so no warning
    const memberViolation = result.violations.find(
      (v) => v.policyName === "member_monthly_soft_limit",
    );
    expect(memberViolation).toBeUndefined();
    expect(result.allowed).toBe(true);
  });

  it("warns when member monthly spend would exceed soft limit", async () => {
    // Simulate that this member already has 950 credits of debits this month
    const existingDebits = [
      createTestLedgerEntry("DEBIT", 950, {
        referenceType: "reservation",
        referenceId: "res_existing",
      }),
    ];
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(existingDebits);

    // The reservation that matches the member
    const reservation = createTestReservation("SETTLED", 950, {
      id: "res_existing",
      swarmId: "member_1", // proxy for memberId
    });
    mockDb.creditReservation.findMany.mockResolvedValue([reservation]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100, // 950 + 100 = 1050 > 1000
      "run",
    );

    const memberViolation = result.violations.find(
      (v) => v.policyName === "member_monthly_soft_limit",
    );
    expect(memberViolation).toBeDefined();
    expect(memberViolation!.severity).toBe("warn");
    expect(memberViolation!.threshold).toBe(1000);
    expect(memberViolation!.actual).toBeCloseTo(1050, 0);
    // Soft limit is a warning, not a block
    expect(result.allowed).toBe(true);
  });

  it("does not warn when exactly at the limit", async () => {
    // Member has spent 900 this month, requesting 100 -> exactly 1000
    const existingDebits = [
      createTestLedgerEntry("DEBIT", 900, {
        referenceType: "reservation",
        referenceId: "res_existing",
      }),
    ];
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(existingDebits);

    const reservation = createTestReservation("SETTLED", 900, {
      id: "res_existing",
      swarmId: "member_1",
    });
    mockDb.creditReservation.findMany.mockResolvedValue([reservation]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100, // 900 + 100 = 1000 = limit
      "run",
    );

    const memberViolation = result.violations.find(
      (v) => v.policyName === "member_monthly_soft_limit",
    );
    // Exactly at the limit: no violation (>= not >)
    expect(memberViolation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Per-swarm hard ceiling
// ---------------------------------------------------------------------------

describe("per-swarm hard ceiling", () => {
  it("blocks when swarm spend would exceed ceiling", async () => {
    // checkPolicies call order:
    // 1. getMemberSpendThisMonth -> creditLedgerEntry.findMany (debits this month)
    //    -> returns [] (no member debits)
    // 2. getSwarmSpend -> creditReservation.findMany (settled for swarm)
    //    -> returns swarm reservations
    //    -> creditLedgerEntry.findMany (debits for those reservations)
    //    -> returns swarm debits

    const swarmReservations = [
      createTestReservation("SETTLED", 4500, {
        id: "res_swarm_1",
        swarmId: "swarm_1",
      }),
    ];

    const swarmDebits = [
      createTestLedgerEntry("DEBIT", 4500, {
        referenceType: "reservation",
        referenceId: "res_swarm_1",
      }),
    ];

    // Call 1: getMemberSpendThisMonth -> ledger debits (empty, no member spend)
    mockDb.creditLedgerEntry.findMany
      .mockResolvedValueOnce([])          // getMemberSpendThisMonth: no debits
      .mockResolvedValueOnce(swarmDebits); // getSwarmSpend: swarm debits

    // Call 1: getMemberSpendThisMonth has no reservation IDs so won't call findMany
    // Call 2: getSwarmSpend -> reservations for swarm
    mockDb.creditReservation.findMany
      .mockResolvedValueOnce(swarmReservations); // getSwarmSpend

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      1000, // 4500 + 1000 = 5500 > 5000
      "swarm",
      "swarm_1",
    );

    const swarmViolation = result.violations.find(
      (v) => v.policyName === "swarm_hard_ceiling",
    );
    expect(swarmViolation).toBeDefined();
    expect(swarmViolation!.severity).toBe("block");
    expect(swarmViolation!.threshold).toBe(5000);
    // The action should be BLOCKED
    expect(result.allowed).toBe(false);
  });

  it("does not check swarm ceiling for non-swarm actions", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100,
      "run", // Not a swarm
      "swarm_1",
    );

    const swarmViolation = result.violations.find(
      (v) => v.policyName === "swarm_hard_ceiling",
    );
    expect(swarmViolation).toBeUndefined();
  });

  it("passes when swarm spend is well below ceiling", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100,
      "swarm",
      "swarm_1",
    );

    const swarmViolation = result.violations.find(
      (v) => v.policyName === "swarm_hard_ceiling",
    );
    expect(swarmViolation).toBeUndefined();
    expect(result.allowed).toBe(true);
  });

  it("does not check swarm ceiling when no swarmId provided", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      100,
      "swarm",
      // no swarmId
    );

    const swarmViolation = result.violations.find(
      (v) => v.policyName === "swarm_hard_ceiling",
    );
    expect(swarmViolation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Approval threshold
// ---------------------------------------------------------------------------

describe("approval threshold", () => {
  it("requires approval when amount exceeds threshold", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      600, // > 500 threshold
      "run",
    );

    expect(result.requiresApproval).toBe(true);

    const approvalViolation = result.violations.find(
      (v) => v.policyName === "approval_threshold",
    );
    expect(approvalViolation).toBeDefined();
    expect(approvalViolation!.severity).toBe("warn");
    expect(approvalViolation!.threshold).toBe(500);
    expect(approvalViolation!.actual).toBe(600);
  });

  it("does not require approval when amount is at or below threshold", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      500, // = threshold (not exceeding)
      "run",
    );

    expect(result.requiresApproval).toBe(false);

    const approvalViolation = result.violations.find(
      (v) => v.policyName === "approval_threshold",
    );
    expect(approvalViolation).toBeUndefined();
  });

  it("does not require approval for small amounts", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      10,
      "run",
    );

    expect(result.requiresApproval).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requiresApproval (direct method)
// ---------------------------------------------------------------------------

describe("requiresApproval", () => {
  it("returns true when amount exceeds threshold", async () => {
    expect(await engine.requiresApproval("ws_1", 501)).toBe(true);
  });

  it("returns false when amount equals threshold", async () => {
    expect(await engine.requiresApproval("ws_1", 500)).toBe(false);
  });

  it("returns false when amount is below threshold", async () => {
    expect(await engine.requiresApproval("ws_1", 499)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMemberSpendThisMonth (direct method)
// ---------------------------------------------------------------------------

describe("getMemberSpendThisMonth", () => {
  it("returns 0 when no debits exist", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);

    const spend = await engine.getMemberSpendThisMonth("member_1");
    expect(spend).toBe(0);
  });

  it("sums debits for the member's reservations", async () => {
    const debits = [
      createTestLedgerEntry("DEBIT", 100, {
        referenceType: "reservation",
        referenceId: "res_1",
      }),
      createTestLedgerEntry("DEBIT", 200, {
        referenceType: "reservation",
        referenceId: "res_2",
      }),
      createTestLedgerEntry("DEBIT", 50, {
        referenceType: "reservation",
        referenceId: "res_3",
      }),
    ];
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(debits);

    // Only res_1 and res_2 belong to this member
    const reservations = [
      createTestReservation("SETTLED", 100, {
        id: "res_1",
        swarmId: "member_1",
      }),
      createTestReservation("SETTLED", 200, {
        id: "res_2",
        swarmId: "member_1",
      }),
    ];
    mockDb.creditReservation.findMany.mockResolvedValue(reservations);

    const spend = await engine.getMemberSpendThisMonth("member_1");
    expect(spend).toBe(300); // 100 + 200, not 50
  });
});

// ---------------------------------------------------------------------------
// getSwarmSpend (direct method)
// ---------------------------------------------------------------------------

describe("getSwarmSpend", () => {
  it("returns 0 when no settled reservations exist for swarm", async () => {
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const spend = await engine.getSwarmSpend("swarm_1");
    expect(spend).toBe(0);
  });

  it("sums debits across all settled reservations for a swarm", async () => {
    const reservations = [
      createTestReservation("SETTLED", 300, { id: "res_1", swarmId: "swarm_1" }),
      createTestReservation("SETTLED", 200, { id: "res_2", swarmId: "swarm_1" }),
    ];
    mockDb.creditReservation.findMany.mockResolvedValue(reservations);

    const debits = [
      createTestLedgerEntry("DEBIT", 300, {
        referenceType: "reservation",
        referenceId: "res_1",
      }),
      createTestLedgerEntry("DEBIT", 200, {
        referenceType: "reservation",
        referenceId: "res_2",
      }),
    ];
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(debits);

    const spend = await engine.getSwarmSpend("swarm_1");
    expect(spend).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Policy enforcement: combined scenarios
// ---------------------------------------------------------------------------

describe("combined policy scenarios", () => {
  it("returns multiple violations when both soft limit and approval threshold are exceeded", async () => {
    // Member already spent 950 this month
    const debits = [
      createTestLedgerEntry("DEBIT", 950, {
        referenceType: "reservation",
        referenceId: "res_existing",
      }),
    ];
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(debits);

    const reservation = createTestReservation("SETTLED", 950, {
      id: "res_existing",
      swarmId: "member_1",
    });
    mockDb.creditReservation.findMany.mockResolvedValue([reservation]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      600, // Exceeds both soft limit (950+600=1550>1000) and approval threshold (600>500)
      "run",
    );

    expect(result.violations).toHaveLength(2);
    expect(result.violations.map((v) => v.policyName)).toContain(
      "member_monthly_soft_limit",
    );
    expect(result.violations.map((v) => v.policyName)).toContain(
      "approval_threshold",
    );
    // Still allowed (soft limit is warning, approval is warning)
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("blocks and requires approval when swarm ceiling and approval threshold are both exceeded", async () => {
    // Swarm already spent 4500
    const swarmReservations = [
      createTestReservation("SETTLED", 4500, {
        id: "res_swarm",
        swarmId: "swarm_1",
      }),
    ];
    const swarmDebits = [
      createTestLedgerEntry("DEBIT", 4500, {
        referenceType: "reservation",
        referenceId: "res_swarm",
      }),
    ];

    mockDb.creditReservation.findMany.mockResolvedValue(swarmReservations);
    mockDb.creditLedgerEntry.findMany.mockResolvedValue(swarmDebits);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      600, // ceiling breach (4500+600=5100>5000), approval needed (600>500)
      "swarm",
      "swarm_1",
    );

    expect(result.allowed).toBe(false); // Blocked by hard ceiling
    expect(result.requiresApproval).toBe(true);

    const swarmViolation = result.violations.find(
      (v) => v.policyName === "swarm_hard_ceiling",
    );
    expect(swarmViolation!.severity).toBe("block");
  });

  it("returns no violations for a small run by a low-spend member", async () => {
    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await engine.checkPolicies(
      "ws_1",
      "member_1",
      50,
      "run",
    );

    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Custom policy config
// ---------------------------------------------------------------------------

describe("custom policy config", () => {
  it("respects custom thresholds", async () => {
    const customPolicy: CreditPolicyConfig = {
      memberMonthlySoftLimit: 100,
      swarmHardCeiling: 200,
      approvalThreshold: 50,
    };

    const customEngine = new CreditPolicyEngine(
      mockDb as unknown as any,
      customPolicy,
    );

    mockDb.creditLedgerEntry.findMany.mockResolvedValue([]);
    mockDb.creditReservation.findMany.mockResolvedValue([]);

    const result = await customEngine.checkPolicies(
      "ws_1",
      "member_1",
      60, // > 50 approval threshold
      "run",
    );

    expect(result.requiresApproval).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default policy values
// ---------------------------------------------------------------------------

describe("DEFAULT_CREDIT_POLICY", () => {
  it("has sensible default values", () => {
    expect(DEFAULT_CREDIT_POLICY.memberMonthlySoftLimit).toBe(1000);
    expect(DEFAULT_CREDIT_POLICY.swarmHardCeiling).toBe(5000);
    expect(DEFAULT_CREDIT_POLICY.approvalThreshold).toBe(500);
  });
});
