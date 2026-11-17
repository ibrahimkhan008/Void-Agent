import { describe, expect, it, vi } from "vitest";

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));

import {
  evaluateMatchRules,
  parseHookConfig,
  publicHookConfig,
} from "./hook-repository.pg";

describe("hook match rules", () => {
  const event = {
    source: "github",
    from: "alice@example.com",
    text: "Pull request opened",
    meta: { subject: "Review the migration" },
  };

  it.each([
    ["contains", "pull request", true],
    ["equals", "Pull request opened", true],
    ["startsWith", "pull", true],
    ["endsWith", "opened", true],
    ["notContains", "closed", true],
    ["notEquals", "closed", true],
    ["startsWith", "opened", false],
    ["notContains", "request", false],
  ] as const)("evaluates %s against text", (op, value, matched) => {
    expect(
      evaluateMatchRules([{ field: "text", op, value }], event).matched,
    ).toBe(matched);
  });

  it("requires a present field for negated rules", () => {
    expect(
      evaluateMatchRules(
        [{ field: "subject", op: "notContains", value: "secret" }],
        { source: "github" },
      ).matched,
    ).toBe(false);
  });

  it("fails closed on corrupt stored operators", () => {
    const rules = parseHookConfig({
      matchRules: [{ field: "text", op: "unrecognized", value: "anything" }],
    }).matchRules;
    expect(evaluateMatchRules(rules, event).matched).toBe(false);
  });

  it("redacts the encrypted GitHub signing secret from owner APIs", () => {
    expect(
      publicHookConfig({
        cooldownSeconds: 60,
        githubSigningSecretEncrypted: "encrypted-value",
      }),
    ).toEqual({ cooldownSeconds: 60, githubSigningSecretConfigured: true });
  });
});
