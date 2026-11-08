import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  updateValues: [] as unknown[],
  predicates: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: { update: mocks.update } }));

import { pgUserRepository } from "./user-repository.pg";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateValues.length = 0;
  mocks.predicates.length = 0;
  mocks.returning.mockResolvedValue([
    {
      id: "owner-1",
      preferences: {
        savedNotes: [{ id: "note-1" }],
        skills: [{ id: "skill-1" }],
        notifications: { backgroundChatAlerts: true },
        onboarding: { step: "connect_tools" },
      },
    },
  ]);
  mocks.where.mockImplementation((predicate: unknown) => {
    mocks.predicates.push(predicate);
    return { returning: mocks.returning };
  });
  mocks.set.mockImplementation((values: unknown) => {
    mocks.updateValues.push(values);
    return { where: mocks.where };
  });
  mocks.update.mockReturnValue({ set: mocks.set });
});

describe("pgUserRepository.updateOnboardingPreference", () => {
  it("atomically patches onboarding without replacing other preferences", async () => {
    const onboarding = {
      step: "done" as const,
      completedAt: "2026-11-08T00:00:00.000Z",
    };
    const result = await pgUserRepository.updateOnboardingPreference(
      "owner-1",
      onboarding,
    );

    expect(result.preferences).toMatchObject({
      savedNotes: [{ id: "note-1" }],
      skills: [{ id: "skill-1" }],
      notifications: { backgroundChatAlerts: true },
    });
    const values = mocks.updateValues[0] as Record<string, unknown>;
    const query = new PgDialect().sqlToQuery(values.preferences as never);
    expect(query.sql).toContain("jsonb_set");
    expect(query.sql).toContain("'{onboarding}'");
    expect(query.sql).toContain("::jsonb");
    expect(query.sql).toContain("::json");
    expect(query.params).toContain(JSON.stringify(onboarding));
    expect(Object.keys(values).sort()).toEqual(["preferences", "updatedAt"]);
    const ownerPredicate = new PgDialect().sqlToQuery(
      mocks.predicates[0] as never,
    );
    expect(ownerPredicate.params).toContain("owner-1");
  });
});
