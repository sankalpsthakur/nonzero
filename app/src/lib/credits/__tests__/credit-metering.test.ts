// ---------------------------------------------------------------------------
// Credit Metering — Unit Tests
// ---------------------------------------------------------------------------
// Tests the conversion of raw platform usage to credit costs.
// Pure math — no DB needed.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  CreditMeter,
  RATE_SANDBOX_PER_SECOND,
  RATE_ARTIFACT_PER_BYTE,
  RATE_SWARM_CHILD,
  RATE_REPLAY_PER_HOUR,
} from "../metering";
import type { RunUsage } from "../types";

const meter = new CreditMeter();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 4 decimal places to match the metering precision. */
function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Rate constants sanity check
// ---------------------------------------------------------------------------

describe("rate constants", () => {
  it("sandbox rate is 1 credit per 60 seconds", () => {
    expect(RATE_SANDBOX_PER_SECOND).toBeCloseTo(1 / 60, 10);
  });

  it("artifact rate is 0.1 credits per MB", () => {
    const oneMB = 1024 * 1024;
    expect(round4(RATE_ARTIFACT_PER_BYTE * oneMB)).toBeCloseTo(0.1, 4);
  });

  it("swarm child rate is 5 credits per child", () => {
    expect(RATE_SWARM_CHILD).toBe(5);
  });

  it("replay rate is 2 credits per hour", () => {
    expect(RATE_REPLAY_PER_HOUR).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// meterSandboxUsage
// ---------------------------------------------------------------------------

describe("meterSandboxUsage", () => {
  it("returns 1 credit for 60 seconds", () => {
    const credits = meter.meterSandboxUsage("sb_1", 60);
    expect(credits).toBeCloseTo(1, 4);
  });

  it("returns 0.5 credits for 30 seconds", () => {
    const credits = meter.meterSandboxUsage("sb_1", 30);
    expect(credits).toBeCloseTo(0.5, 4);
  });

  it("returns 10 credits for 600 seconds (10 minutes)", () => {
    const credits = meter.meterSandboxUsage("sb_1", 600);
    expect(credits).toBeCloseTo(10, 4);
  });

  it("returns 0 for zero duration", () => {
    expect(meter.meterSandboxUsage("sb_1", 0)).toBe(0);
  });

  it("returns 0 for negative duration", () => {
    expect(meter.meterSandboxUsage("sb_1", -100)).toBe(0);
  });

  it("handles very large durations (24 hours)", () => {
    const oneDay = 24 * 60 * 60; // 86400 seconds
    const credits = meter.meterSandboxUsage("sb_1", oneDay);
    expect(credits).toBeCloseTo(1440, 1); // 86400/60 = 1440
  });

  it("handles fractional seconds", () => {
    const credits = meter.meterSandboxUsage("sb_1", 90);
    expect(credits).toBeCloseTo(1.5, 4);
  });
});

// ---------------------------------------------------------------------------
// meterArtifactStorage
// ---------------------------------------------------------------------------

describe("meterArtifactStorage", () => {
  it("returns 0.1 credits for 1 MB", () => {
    const oneMB = 1024 * 1024;
    const credits = meter.meterArtifactStorage(oneMB);
    expect(credits).toBeCloseTo(0.1, 4);
  });

  it("returns 1 credit for 10 MB", () => {
    const tenMB = 10 * 1024 * 1024;
    const credits = meter.meterArtifactStorage(tenMB);
    expect(credits).toBeCloseTo(1, 4);
  });

  it("returns 0 for zero bytes", () => {
    expect(meter.meterArtifactStorage(0)).toBe(0);
  });

  it("returns 0 for negative bytes", () => {
    expect(meter.meterArtifactStorage(-1000)).toBe(0);
  });

  it("handles very large artifacts (1 GB)", () => {
    const oneGB = 1024 * 1024 * 1024;
    const credits = meter.meterArtifactStorage(oneGB);
    // 1 GB = 1024 MB -> 1024 * 0.1 = 102.4 credits
    expect(credits).toBeCloseTo(102.4, 1);
  });

  it("handles small artifacts (1 KB)", () => {
    const oneKB = 1024;
    const credits = meter.meterArtifactStorage(oneKB);
    // 1 KB = 1/1024 MB -> 0.1/1024 ≈ 0.0000977
    expect(credits).toBeCloseTo(0.0001, 4);
  });

  it("handles very large artifacts (100 GB)", () => {
    const hundredGB = 100 * 1024 * 1024 * 1024;
    const credits = meter.meterArtifactStorage(hundredGB);
    // 100 GB = 102400 MB -> 10240 credits
    expect(credits).toBeCloseTo(10240, 0);
  });
});

// ---------------------------------------------------------------------------
// meterSwarmChildren
// ---------------------------------------------------------------------------

describe("meterSwarmChildren", () => {
  it("returns 5 credits for 1 child", () => {
    expect(meter.meterSwarmChildren(1)).toBe(5);
  });

  it("returns 50 credits for 10 children", () => {
    expect(meter.meterSwarmChildren(10)).toBe(50);
  });

  it("returns 0 for zero children", () => {
    expect(meter.meterSwarmChildren(0)).toBe(0);
  });

  it("returns 0 for negative count", () => {
    expect(meter.meterSwarmChildren(-5)).toBe(0);
  });

  it("handles many children (100 children)", () => {
    expect(meter.meterSwarmChildren(100)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// meterReplayDuration
// ---------------------------------------------------------------------------

describe("meterReplayDuration", () => {
  it("returns 2 credits for 1 hour", () => {
    expect(meter.meterReplayDuration(1)).toBe(2);
  });

  it("returns 1 credit for 30 minutes (0.5 hours)", () => {
    expect(meter.meterReplayDuration(0.5)).toBe(1);
  });

  it("returns 48 credits for 24 hours", () => {
    expect(meter.meterReplayDuration(24)).toBe(48);
  });

  it("returns 0 for zero duration", () => {
    expect(meter.meterReplayDuration(0)).toBe(0);
  });

  it("returns 0 for negative duration", () => {
    expect(meter.meterReplayDuration(-2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeRunCost
// ---------------------------------------------------------------------------

describe("computeRunCost", () => {
  it("computes correct total for a realistic research run", () => {
    const run: RunUsage = {
      sandboxSeconds: 3600, // 1 hour -> 60 credits
      artifactStorageBytes: 50 * 1024 * 1024, // 50 MB -> 5 credits
      swarmChildrenSpawned: 3, // -> 15 credits
      replayDurationHours: 0, // no replay
    };

    const cost = meter.computeRunCost(run);

    expect(cost.sandboxCredits).toBeCloseTo(60, 1);
    expect(cost.artifactStorageCredits).toBeCloseTo(5, 1);
    expect(cost.swarmChildrenCredits).toBe(15);
    expect(cost.replayCredits).toBe(0);
    expect(cost.totalCredits).toBeCloseTo(80, 1);
  });

  it("computes correct total for a shadow-live replay run", () => {
    const run: RunUsage = {
      sandboxSeconds: 7200, // 2 hours -> 120 credits
      artifactStorageBytes: 10 * 1024 * 1024, // 10 MB -> 1 credit
      swarmChildrenSpawned: 0,
      replayDurationHours: 8, // 8 hours -> 16 credits
    };

    const cost = meter.computeRunCost(run);

    expect(cost.sandboxCredits).toBeCloseTo(120, 1);
    expect(cost.artifactStorageCredits).toBeCloseTo(1, 1);
    expect(cost.swarmChildrenCredits).toBe(0);
    expect(cost.replayCredits).toBe(16);
    expect(cost.totalCredits).toBeCloseTo(137, 0);
  });

  it("returns all zeros for a run with no usage", () => {
    const run: RunUsage = {
      sandboxSeconds: 0,
      artifactStorageBytes: 0,
      swarmChildrenSpawned: 0,
      replayDurationHours: 0,
    };

    const cost = meter.computeRunCost(run);

    expect(cost.sandboxCredits).toBe(0);
    expect(cost.artifactStorageCredits).toBe(0);
    expect(cost.swarmChildrenCredits).toBe(0);
    expect(cost.replayCredits).toBe(0);
    expect(cost.totalCredits).toBe(0);
  });

  it("total equals sum of all components", () => {
    const run: RunUsage = {
      sandboxSeconds: 1800,
      artifactStorageBytes: 25 * 1024 * 1024,
      swarmChildrenSpawned: 5,
      replayDurationHours: 2,
    };

    const cost = meter.computeRunCost(run);

    const expectedTotal = round4(
      cost.sandboxCredits +
        cost.artifactStorageCredits +
        cost.swarmChildrenCredits +
        cost.replayCredits,
    );

    expect(cost.totalCredits).toBeCloseTo(expectedTotal, 4);
  });

  it("handles a heavy swarm run with many children", () => {
    const run: RunUsage = {
      sandboxSeconds: 36000, // 10 hours
      artifactStorageBytes: 1024 * 1024 * 1024, // 1 GB
      swarmChildrenSpawned: 50,
      replayDurationHours: 0,
    };

    const cost = meter.computeRunCost(run);

    // 36000/60 = 600 sandbox credits
    expect(cost.sandboxCredits).toBeCloseTo(600, 1);
    // 1024 MB * 0.1 = 102.4 artifact credits
    expect(cost.artifactStorageCredits).toBeCloseTo(102.4, 1);
    // 50 * 5 = 250 swarm credits
    expect(cost.swarmChildrenCredits).toBe(250);
    expect(cost.totalCredits).toBeCloseTo(952.4, 0);
  });
});

// ---------------------------------------------------------------------------
// estimateSwarmCost
// ---------------------------------------------------------------------------

describe("estimateSwarmCost", () => {
  it("estimates cost for a standard swarm template", () => {
    const template = {
      defaultConcurrency: 5,
    };

    // 30 minutes per child -> 5 * 1800 = 9000 total sandbox seconds
    const estimate = meter.estimateSwarmCost(template, 1800, 1000);

    // Sandbox: 9000/60 = 150 credits
    // Children: 5 * 5 = 25 credits
    // Total: 175
    expect(estimate.breakdown.sandboxCredits).toBeCloseTo(150, 1);
    expect(estimate.breakdown.swarmChildrenCredits).toBe(25);
    expect(estimate.estimated).toBeCloseTo(175, 1);
    expect(estimate.affordable).toBe(true);
    expect(estimate.availableBalance).toBe(1000);
  });

  it("marks as not affordable when balance is insufficient", () => {
    const template = { defaultConcurrency: 10 };

    // 1 hour per child -> 10 * 3600 = 36000 sandbox seconds
    const estimate = meter.estimateSwarmCost(template, 3600, 100);

    // Sandbox: 36000/60 = 600 credits
    // Children: 10 * 5 = 50 credits
    // Total: 650
    expect(estimate.estimated).toBeCloseTo(650, 1);
    expect(estimate.affordable).toBe(false);
    expect(estimate.availableBalance).toBe(100);
  });

  it("defaults to Infinity available balance (always affordable)", () => {
    const template = { defaultConcurrency: 3 };
    const estimate = meter.estimateSwarmCost(template, 600);

    expect(estimate.affordable).toBe(true);
    expect(estimate.availableBalance).toBe(Infinity);
  });

  it("handles zero duration", () => {
    const template = { defaultConcurrency: 5 };
    const estimate = meter.estimateSwarmCost(template, 0, 1000);

    // Only children cost: 5 * 5 = 25
    expect(estimate.breakdown.sandboxCredits).toBe(0);
    expect(estimate.breakdown.swarmChildrenCredits).toBe(25);
    expect(estimate.estimated).toBe(25);
  });

  it("handles single-child swarm", () => {
    const template = { defaultConcurrency: 1 };
    const estimate = meter.estimateSwarmCost(template, 120, 100);

    // Sandbox: 120/60 = 2 credits
    // Children: 1 * 5 = 5 credits
    expect(estimate.estimated).toBeCloseTo(7, 1);
  });

  it("does not include artifact or replay in estimate (unknown at launch)", () => {
    const template = { defaultConcurrency: 5 };
    const estimate = meter.estimateSwarmCost(template, 300, 1000);

    expect(estimate.breakdown.artifactStorageCredits).toBe(0);
    expect(estimate.breakdown.replayCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and precision
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("maintains 4-decimal precision on sandbox metering", () => {
    // 1 second -> 1/60 = 0.01666...  -> rounds to 0.0167
    const credits = meter.meterSandboxUsage("sb_1", 1);
    const str = credits.toString();
    const decimals = str.includes(".") ? str.split(".")[1]!.length : 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("all meter functions return non-negative values", () => {
    expect(meter.meterSandboxUsage("x", -1)).toBeGreaterThanOrEqual(0);
    expect(meter.meterArtifactStorage(-1)).toBeGreaterThanOrEqual(0);
    expect(meter.meterSwarmChildren(-1)).toBeGreaterThanOrEqual(0);
    expect(meter.meterReplayDuration(-1)).toBeGreaterThanOrEqual(0);
  });

  it("metering very short sandbox duration (1 second)", () => {
    const credits = meter.meterSandboxUsage("sb_1", 1);
    expect(credits).toBeGreaterThan(0);
    expect(credits).toBeLessThan(0.02);
  });

  it("metering a single byte of storage", () => {
    const credits = meter.meterArtifactStorage(1);
    expect(credits).toBeGreaterThanOrEqual(0);
    // So small it rounds to 0.0000 at 4 decimal places
    expect(credits).toBeLessThan(0.001);
  });
});
