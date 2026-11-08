import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  selectRows: [] as unknown[][],
  updateReturning: [] as unknown[][],
  insertReturning: [] as unknown[][],
  insertedValues: [] as unknown[],
}));

vi.mock("../db.pg", () => ({ pgDb: { transaction: mocks.transaction } }));
vi.mock("server-only", () => ({}));

import { teamInvitationRepository } from "./team-invitation-repository.pg";

function createTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = mocks.selectRows.shift() ?? [];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            for: async () => rows,
          });
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          const rows = mocks.updateReturning.shift() ?? [];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            returning: async () => rows,
          });
        },
      }),
    }),
    insert: () => ({
      values: (value: unknown) => {
        mocks.insertedValues.push(value);
        const rows = mocks.insertReturning.shift() ?? [];
        if (mocks.insertedValues.length % 2 === 0) return Promise.resolve();
        return {
          onConflictDoNothing: () => ({ returning: async () => rows }),
          returning: async () => rows,
        };
      },
    }),
  };
}

const token = "invitation-token-that-is-not-the-stored-digest";
const now = new Date(Date.now() + 60_000);
const userId = "00000000-0000-4000-8000-000000000010";
const teamId = "00000000-0000-4000-8000-000000000011";
const pending = {
  id: "00000000-0000-4000-8000-000000000012",
  teamId,
  email: "person@example.test",
  role: "viewer",
  status: "pending",
  expiresAt: now,
  acceptedByUserId: null,
};

describe("teamInvitationRepository.accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows = [];
    mocks.updateReturning = [];
    mocks.insertReturning = [];
    mocks.insertedValues = [];
    mocks.transaction.mockImplementation(async (callback) =>
      callback(createTx()),
    );
  });

  it("atomically adds the member, budget policy, and accepted state", async () => {
    mocks.selectRows.push(
      [pending],
      [{ ownerId: "00000000-0000-4000-8000-000000000099" }],
      [pending],
      [{ email: "PERSON@example.test", emailVerified: true, banned: false }],
      [],
    );
    mocks.insertReturning.push([{ id: "membership-id" }]);
    mocks.updateReturning.push([{ id: pending.id }]);

    await expect(
      teamInvitationRepository.accept({ token, userId }),
    ).resolves.toEqual({ status: "accepted", teamId });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertedValues).toEqual([
      { teamId, userId, role: "viewer" },
      {
        memberId: "membership-id",
        monthlyCapMicros: 15_000_000,
        currency: "EUR",
        hardStop: true,
      },
    ]);
    expect(mocks.updateReturning).toHaveLength(0);
  });

  it("rejects unverified or mismatched account emails before membership writes", async () => {
    mocks.selectRows.push(
      [pending],
      [{ ownerId: "00000000-0000-4000-8000-000000000099" }],
      [pending],
      [{ email: "other@example.test", emailVerified: true, banned: false }],
    );
    await expect(
      teamInvitationRepository.accept({ token, userId }),
    ).resolves.toEqual({ status: "invalid" });
    expect(mocks.insertedValues).toEqual([]);
  });

  it("rejects an unverified invited address", async () => {
    mocks.selectRows.push(
      [pending],
      [{ ownerId: "00000000-0000-4000-8000-000000000099" }],
      [pending],
      [{ email: "person@example.test", emailVerified: false, banned: false }],
    );
    await expect(
      teamInvitationRepository.accept({ token, userId }),
    ).resolves.toEqual({ status: "invalid" });
    expect(mocks.insertedValues).toEqual([]);
  });

  it("treats a replay by the already accepted user as idempotent", async () => {
    mocks.selectRows.push(
      [{ ...pending, status: "accepted", acceptedByUserId: userId }],
      [{ ownerId: "00000000-0000-4000-8000-000000000099" }],
      [{ ...pending, status: "accepted", acceptedByUserId: userId }],
    );
    await expect(
      teamInvitationRepository.accept({ token, userId }),
    ).resolves.toEqual({ status: "accepted", teamId });
    expect(mocks.insertedValues).toEqual([]);
  });
});
