// ---------------------------------------------------------------------------
// Credit Metering — Usage-to-Credits Conversion
// ---------------------------------------------------------------------------
// Converts raw platform usage (sandbox seconds, storage bytes, swarm children,
// replay hours) into credit costs.  Rates are centralised here so that every
// part of the system agrees on the cost model.
// ---------------------------------------------------------------------------

import type {
  RunUsage,
  CreditCost,
  CreditEstimate,
} from "./types";

// ---------------------------------------------------------------------------
// Rates (credits per unit)
// ---------------------------------------------------------------------------

/** 1 credit per 60 sandbox-seconds. */
export const RATE_SANDBOX_PER_SECOND = 1 / 60;

/** 0.1 credits per MB of artifact storage. */
export const RATE_ARTIFACT_PER_BYTE = 0.1 / (1024 * 1024);

/** 5 credits per swarm child spawn. */
export const RATE_SWARM_CHILD = 5;

/** 2 credits per hour of shadow-live replay. */
export const RATE_REPLAY_PER_HOUR = 2;

// ---------------------------------------------------------------------------
// SwarmTemplate shape (minimal interface needed for estimation)
// ---------------------------------------------------------------------------

/** Minimal swarm template interface used for cost estimation. */
export interface SwarmTemplateForEstimate {
  /** Default number of concurrent children. */
  defaultConcurrency: number;
  /** Default credit ceiling, if any. */
  defaultCreditCeiling?: number;
}

// ---------------------------------------------------------------------------
// CreditMeter
// ---------------------------------------------------------------------------

export class CreditMeter {
  // -----------------------------------------------------------------------
  // Individual metering functions
  // -----------------------------------------------------------------------

  /**
   * Meter sandbox usage.
   * Rate: 1 credit per 60 seconds.
   * @returns credits consumed (always >= 0)
   */
  meterSandboxUsage(_sandboxId: string, durationSeconds: number): number {
    if (durationSeconds <= 0) return 0;
    return round(durationSeconds * RATE_SANDBOX_PER_SECOND);
  }

  /**
   * Meter artifact storage.
   * Rate: 0.1 credits per megabyte.
   * @returns credits consumed (always >= 0)
   */
  meterArtifactStorage(sizeBytes: number): number {
    if (sizeBytes <= 0) return 0;
    return round(sizeBytes * RATE_ARTIFACT_PER_BYTE);
  }

  /**
   * Meter swarm child spawns.
   * Rate: 5 credits per child.
   * @returns credits consumed (always >= 0)
   */
  meterSwarmChildren(count: number): number {
    if (count <= 0) return 0;
    return round(count * RATE_SWARM_CHILD);
  }

  /**
   * Meter shadow-live replay duration.
   * Rate: 2 credits per hour.
   * @returns credits consumed (always >= 0)
   */
  meterReplayDuration(durationHours: number): number {
    if (durationHours <= 0) return 0;
    return round(durationHours * RATE_REPLAY_PER_HOUR);
  }

  // -----------------------------------------------------------------------
  // Composite metering
  // -----------------------------------------------------------------------

  /**
   * Compute the full credit cost breakdown for a completed run.
   */
  computeRunCost(run: RunUsage): CreditCost {
    const sandboxCredits = this.meterSandboxUsage("run", run.sandboxSeconds);
    const artifactStorageCredits = this.meterArtifactStorage(run.artifactStorageBytes);
    const swarmChildrenCredits = this.meterSwarmChildren(run.swarmChildrenSpawned);
    const replayCredits = this.meterReplayDuration(run.replayDurationHours);

    return {
      sandboxCredits,
      artifactStorageCredits,
      swarmChildrenCredits,
      replayCredits,
      totalCredits: round(
        sandboxCredits + artifactStorageCredits + swarmChildrenCredits + replayCredits,
      ),
    };
  }

  /**
   * Estimate the credit cost for a swarm before launch.
   *
   * Uses the template's concurrency and the estimated duration to project
   * sandbox costs, plus a fixed cost per child spawn.
   *
   * @param template - The swarm template being launched.
   * @param estimatedDurationSeconds - Estimated total run time in seconds.
   * @param availableBalance - The account's available balance for affordability check.
   */
  estimateSwarmCost(
    template: SwarmTemplateForEstimate,
    estimatedDurationSeconds: number,
    availableBalance: number = Infinity,
  ): CreditEstimate {
    const childCount = template.defaultConcurrency;

    // Each child runs for the estimated duration
    const totalSandboxSeconds = childCount * estimatedDurationSeconds;

    const breakdown = this.computeRunCost({
      sandboxSeconds: totalSandboxSeconds,
      artifactStorageBytes: 0, // Unknown at estimate time
      swarmChildrenSpawned: childCount,
      replayDurationHours: 0, // Unknown at estimate time
    });

    return {
      estimated: breakdown.totalCredits,
      breakdown,
      affordable: availableBalance >= breakdown.totalCredits,
      availableBalance,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 4 decimal places to match Prisma Decimal(20,4) precision. */
function round(val: number): number {
  return Math.round(val * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const creditMeter = new CreditMeter();
