import type { CreditService } from "@/lib/credits/credit-service";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { settleReservations } from "../credit-settlement";
import { MockDecimal } from "@/lib/credits/__tests__/helpers";

function createReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res_1",
    accountId: "acct_1",
    amount: new MockDecimal(120),
    status: "PENDING",
    runId: "run_1",
    swarmId: null,
    account: {
      id: "acct_1",
    },
    ...overrides,
  };
}

function createDbClient() {
  return {
    creditReservation: {
      findMany: vi.fn(),
    },
    run: {
      findUnique: vi.fn(),
    },
    swarm: {
      findUnique: vi.fn(),
    },
    swarmChild: {
      findMany: vi.fn(),
    },
  };
}

describe("settleReservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("settles completed run reservations through CreditService using actual usage", async () => {
    const dbClient = createDbClient();
    const creditService = {
      settleReservation: vi.fn().mockResolvedValue({
        reservationId: "res_1",
        debited: 45,
        released: 75,
        ledgerEntryIds: ["led_debit", "led_release"],
      }),
    } as Pick<CreditService, "settleReservation">;

    dbClient.creditReservation.findMany.mockResolvedValue([
      createReservation(),
    ]);
    dbClient.run.findUnique
      .mockResolvedValueOnce({ status: "COMPLETED" })
      .mockResolvedValueOnce({
        startedAt: new Date("2026-03-15T10:00:00.000Z"),
        completedAt: new Date("2026-03-15T10:00:45.000Z"),
      });
    dbClient.swarm.findUnique.mockResolvedValue(null);
    dbClient.swarmChild.findMany.mockResolvedValue([]);

    const result = await settleReservations({
      dbClient: dbClient as never,
      creditService,
    });

    expect(creditService.settleReservation).toHaveBeenCalledWith("res_1", 45);
    expect(result.totalReservationsSettled).toBe(1);
    expect(result.totalDebited).toBe(45);
    expect(result.totalReleased).toBe(75);
    expect(result.ledgerEntriesCreated).toBe(2);
  });

  it("settles orphaned reservations as zero-usage releases", async () => {
    const dbClient = createDbClient();
    const creditService = {
      settleReservation: vi.fn().mockResolvedValue({
        reservationId: "res_orphan",
        debited: 0,
        released: 80,
        ledgerEntryIds: ["led_release"],
      }),
    } as Pick<CreditService, "settleReservation">;

    dbClient.creditReservation.findMany.mockResolvedValue([
      createReservation({
        id: "res_orphan",
        amount: new MockDecimal(80),
        runId: "missing_run",
      }),
    ]);
    dbClient.run.findUnique.mockResolvedValue(null);
    dbClient.swarm.findUnique.mockResolvedValue(null);
    dbClient.swarmChild.findMany.mockResolvedValue([]);

    const result = await settleReservations({
      dbClient: dbClient as never,
      creditService,
    });

    expect(creditService.settleReservation).toHaveBeenCalledWith(
      "res_orphan",
      0,
    );
    expect(result.totalReservationsSettled).toBe(1);
    expect(result.totalDebited).toBe(0);
    expect(result.totalReleased).toBe(80);
    expect(result.ledgerEntriesCreated).toBe(1);
  });

  it("skips reservations whose run is still active", async () => {
    const dbClient = createDbClient();
    const creditService = {
      settleReservation: vi.fn(),
    } as Pick<CreditService, "settleReservation">;

    dbClient.creditReservation.findMany.mockResolvedValue([
      createReservation(),
    ]);
    dbClient.run.findUnique.mockResolvedValue({ status: "RUNNING" });
    dbClient.swarm.findUnique.mockResolvedValue(null);
    dbClient.swarmChild.findMany.mockResolvedValue([]);

    const result = await settleReservations({
      dbClient: dbClient as never,
      creditService,
    });

    expect(creditService.settleReservation).not.toHaveBeenCalled();
    expect(result.totalReservationsSettled).toBe(0);
    expect(result.totalDebited).toBe(0);
    expect(result.totalReleased).toBe(0);
    expect(result.ledgerEntriesCreated).toBe(0);
  });
});
