import { describe, expect, it } from "vitest";
import {
  TeamBudgetAuthorizationError,
  TeamBudgetPolicyError,
  checkBudgetReservation,
  getCurrentBudgetPeriod,
  resolveMemberBudgetPolicy,
  settleBudgetCounters,
} from "./team-member-ai-budget-core";

const memberPolicy = {
  memberId: "seat-1",
  userId: "user-1",
  teamId: "team-1",
  role: "member",
  teamOwnerId: "owner-1",
  monthlyCapMicros: 10_000,
  currency: "EUR",
  hardStop: true,
};

describe("team member AI budget policy and ledger", () => {
  it("requires the authenticated user and team to match the membership", () => {
    expect(() =>
      resolveMemberBudgetPolicy({
        policy: memberPolicy,
        userId: "other-user",
        teamId: "team-1",
      }),
    ).toThrow(TeamBudgetAuthorizationError);
    expect(() =>
      resolveMemberBudgetPolicy({
        policy: memberPolicy,
        userId: "user-1",
        teamId: "other-team",
      }),
    ).toThrow(TeamBudgetAuthorizationError);
  });

  it("leaves owners uncapped and fails closed on missing member policy", () => {
    expect(
      resolveMemberBudgetPolicy({
        policy: { ...memberPolicy, role: "owner" },
        userId: "user-1",
        teamId: "team-1",
      }),
    ).toBeNull();
    expect(() =>
      resolveMemberBudgetPolicy({
        policy: { ...memberPolicy, hardStop: false },
        userId: "user-1",
        teamId: "team-1",
      }),
    ).toThrow(TeamBudgetPolicyError);
  });

  it("serializes concurrent reservations so only available cap is reserved", async () => {
    let ledger = { finalizedMicros: 0, reservedMicros: 0 };
    let lock: Promise<void> = Promise.resolve();
    const reserve = async () => {
      let unlock!: () => void;
      const previous = lock;
      lock = new Promise<void>((resolve) => (unlock = resolve));
      await previous;
      try {
        const result = checkBudgetReservation({
          ...ledger,
          capMicros: 10_000,
          estimateMicros: 4_000,
        });
        if (result.allowed) {
          ledger = { ...ledger, reservedMicros: result.nextReservedMicros };
        }
        return result.allowed;
      } finally {
        unlock();
      }
    };

    const results = await Promise.all(Array.from({ length: 8 }, reserve));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(ledger.reservedMicros).toBe(8_000);
  });

  it("settles actual usage or releases a reservation exactly once at the ledger boundary", () => {
    expect(
      settleBudgetCounters({
        finalizedMicros: 1_000,
        reservedMicros: 4_000,
        estimateMicros: 4_000,
        actualMicros: 3_000,
      }),
    ).toEqual({ finalizedMicros: 4_000, reservedMicros: 0 });
    expect(
      settleBudgetCounters({
        finalizedMicros: 1_000,
        reservedMicros: 4_000,
        estimateMicros: 4_000,
      }),
    ).toEqual({ finalizedMicros: 1_000, reservedMicros: 0 });
  });

  it("uses UTC calendar months", () => {
    const period = getCurrentBudgetPeriod(new Date("2026-11-30T23:59:00Z"));
    expect(period.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
