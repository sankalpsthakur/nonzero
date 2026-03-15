// ---------------------------------------------------------------------------
// Credit Policy Engine — Enforcement Layer
// ---------------------------------------------------------------------------
// Checks workspace-level credit policies before allowing reservations.
//
// Three policy dimensions:
// 1. Per-member soft limit   — warn when a member's monthly spend exceeds a threshold.
// 2. Per-swarm hard ceiling  — block launch when a swarm would exceed its credit ceiling.
// 3. Approval threshold      — require human approval for launches above a credit amount.
// ---------------------------------------------------------------------------

import { type PrismaClient } from "@prisma/client";
import db from "@/lib/db";
import {
  DEFAULT_CREDIT_POLICY,
  type CreditPolicyConfig,
  type PolicyCheckResult,
  type PolicyViolation,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Prisma Decimal to number. */
function d(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof (val as { toNumber: () => number }).toNumber === "function") {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

// ---------------------------------------------------------------------------
// CreditPolicyEngine
// ---------------------------------------------------------------------------

export class CreditPolicyEngine {
  private readonly prisma: PrismaClient;
  private readonly defaultPolicy: CreditPolicyConfig;

  constructor(
    prisma?: PrismaClient,
    defaultPolicy?: CreditPolicyConfig,
  ) {
    this.prisma = (prisma ?? db) as PrismaClient;
    this.defaultPolicy = defaultPolicy ?? DEFAULT_CREDIT_POLICY;
  }

  // -----------------------------------------------------------------------
  // checkPolicies
  // -----------------------------------------------------------------------

  /**
   * Run all credit policy checks for a proposed action.
   *
   * @param workspaceId - The workspace the action belongs to.
   * @param memberId - The member initiating the action.
   * @param amount - The credit amount being requested.
   * @param type - Whether this is a 'swarm' launch or a 'run'.
   * @param swarmId - (Optional) swarm ID for per-swarm ceiling checks.
   * @returns PolicyCheckResult indicating whether the action is allowed,
   *          requires approval, and any violations/warnings.
   */
  async checkPolicies(
    workspaceId: string,
    memberId: string,
    amount: number,
    type: "swarm" | "run",
    swarmId?: string,
  ): Promise<PolicyCheckResult> {
    const policy = await this.getWorkspacePolicy(workspaceId);
    const violations: PolicyViolation[] = [];

    // 1. Per-member monthly soft limit
    const memberSpend = await this.getMemberSpendThisMonth(memberId);
    const projectedSpend = memberSpend + amount;

    if (projectedSpend > policy.memberMonthlySoftLimit) {
      violations.push({
        policyName: "member_monthly_soft_limit",
        severity: "warn",
        message:
          `Member monthly spend (${projectedSpend.toFixed(2)}) would exceed ` +
          `soft limit (${policy.memberMonthlySoftLimit.toFixed(2)})`,
        threshold: policy.memberMonthlySoftLimit,
        actual: projectedSpend,
      });
    }

    // 2. Per-swarm hard ceiling (only for swarm launches)
    if (type === "swarm" && swarmId) {
      const swarmSpend = await this.getSwarmSpend(swarmId);
      const projectedSwarmSpend = swarmSpend + amount;

      if (projectedSwarmSpend > policy.swarmHardCeiling) {
        violations.push({
          policyName: "swarm_hard_ceiling",
          severity: "block",
          message:
            `Swarm spend (${projectedSwarmSpend.toFixed(2)}) would exceed ` +
            `hard ceiling (${policy.swarmHardCeiling.toFixed(2)})`,
          threshold: policy.swarmHardCeiling,
          actual: projectedSwarmSpend,
        });
      }
    }

    // 3. Approval threshold
    const needsApproval = await this.requiresApproval(workspaceId, amount);

    if (needsApproval) {
      violations.push({
        policyName: "approval_threshold",
        severity: "warn",
        message:
          `Amount (${amount.toFixed(2)}) exceeds approval threshold ` +
          `(${policy.approvalThreshold.toFixed(2)})`,
        threshold: policy.approvalThreshold,
        actual: amount,
      });
    }

    // Determine overall result
    const hasBlock = violations.some((v) => v.severity === "block");

    return {
      allowed: !hasBlock,
      requiresApproval: needsApproval,
      violations,
    };
  }

  // -----------------------------------------------------------------------
  // getMemberSpendThisMonth
  // -----------------------------------------------------------------------

  /**
   * Get total credit debits attributed to a member in the current calendar month.
   *
   * Since the current schema does not store memberId directly on ledger entries,
   * we approximate by summing DEBIT entries linked to reservations that have
   * the member's swarmId or runId.  A production implementation would add a
   * memberId column to CreditReservation.
   */
  async getMemberSpendThisMonth(memberId: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const debits = await this.prisma.creditLedgerEntry.findMany({
      where: {
        type: "DEBIT",
        createdAt: { gte: monthStart },
        referenceType: "reservation",
      },
    });

    // Filter to reservations belonging to this member
    const reservationIds = debits
      .map((d) => d.referenceId)
      .filter(Boolean) as string[];

    if (reservationIds.length === 0) return 0;

    const reservations = await this.prisma.creditReservation.findMany({
      where: {
        id: { in: reservationIds },
        // Use swarmId or runId as a proxy for memberId
        OR: [
          { swarmId: memberId },
          { runId: memberId },
        ],
      },
    });

    const memberReservationIds = new Set(reservations.map((r) => r.id));

    return debits
      .filter((entry) => entry.referenceId && memberReservationIds.has(entry.referenceId))
      .reduce((sum, entry) => sum + d(entry.amount), 0);
  }

  // -----------------------------------------------------------------------
  // getSwarmSpend
  // -----------------------------------------------------------------------

  /**
   * Get total credit debits for a specific swarm.
   */
  async getSwarmSpend(swarmId: string): Promise<number> {
    const reservations = await this.prisma.creditReservation.findMany({
      where: {
        swarmId,
        status: "SETTLED",
      },
    });

    if (reservations.length === 0) return 0;

    const reservationIds = reservations.map((r) => r.id);

    const debits = await this.prisma.creditLedgerEntry.findMany({
      where: {
        type: "DEBIT",
        referenceType: "reservation",
        referenceId: { in: reservationIds },
      },
    });

    return debits.reduce((sum, entry) => sum + d(entry.amount), 0);
  }

  // -----------------------------------------------------------------------
  // requiresApproval
  // -----------------------------------------------------------------------

  /**
   * Does this credit amount require human approval in this workspace?
   */
  async requiresApproval(
    workspaceId: string,
    amount: number,
  ): Promise<boolean> {
    const policy = await this.getWorkspacePolicy(workspaceId);
    return amount > policy.approvalThreshold;
  }

  // -----------------------------------------------------------------------
  // getWorkspacePolicy (private)
  // -----------------------------------------------------------------------

  /**
   * Fetch the credit policy for a workspace.
   * Falls back to defaults if no custom policy is configured.
   *
   * In a production implementation this would read from a WorkspaceCreditPolicy
   * table.  For now, we return the defaults.
   */
  private async getWorkspacePolicy(
    _workspaceId: string,
  ): Promise<CreditPolicyConfig> {
    // Placeholder: always return defaults.
    // A real implementation would do:
    //   const custom = await this.prisma.workspaceCreditPolicy.findUnique(...)
    //   return custom ? mapToConfig(custom) : this.defaultPolicy;
    return this.defaultPolicy;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const creditPolicyEngine = new CreditPolicyEngine();
