import { describe, expect, it } from "vitest";
import { normalizeAgentFileBindings } from "./agent-files";

describe("normalizeAgentFileBindings", () => {
  it("converts owned uploaded-file URLs to server-owned bindings", () => {
    expect(
      normalizeAgentFileBindings({
        files: [
          {
            url: "/api/files/uploads/user-a/templates/report.csv",
            filename: "templates/report.csv",
            ownerId: "user-b",
          },
        ],
        userId: "user-a",
      }),
    ).toEqual({
      ok: true,
      files: [
        {
          storageKey: "uploads/user-a/templates/report.csv",
          filename: "report.csv",
          ownerId: "user-a",
        },
      ],
    });
  });

  it("rejects another user's key and path traversal", () => {
    expect(
      normalizeAgentFileBindings({
        files: [
          {
            storageKey: "uploads/user-b/private.csv",
            filename: "private.csv",
          },
        ],
        userId: "user-a",
      }),
    ).toEqual({ ok: false, reason: "not-owned" });

    expect(
      normalizeAgentFileBindings({
        files: [
          {
            url: "/api/files/uploads/user-a/../user-b/private.csv",
            filename: "private.csv",
          },
        ],
        userId: "user-a",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("preserves the original owner for a carried shared-agent binding", () => {
    expect(
      normalizeAgentFileBindings({
        files: [
          {
            storageKey: "uploads/user-a/reference.csv",
            filename: "renamed.csv",
            ownerId: "attacker-controlled",
          },
        ],
        userId: "user-b",
        existingFiles: [
          {
            storageKey: "uploads/user-a/reference.csv",
            filename: "reference.csv",
            ownerId: "user-a",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      files: [
        {
          storageKey: "uploads/user-a/reference.csv",
          filename: "renamed.csv",
          ownerId: "user-a",
        },
      ],
    });
  });

  it("does not trust an owner ID supplied for a new binding", () => {
    expect(
      normalizeAgentFileBindings({
        files: [
          {
            storageKey: "uploads/user-a/new.csv",
            filename: "new.csv",
            ownerId: "user-b",
          },
        ],
        userId: "user-a",
      }),
    ).toMatchObject({
      ok: true,
      files: [{ ownerId: "user-a" }],
    });
  });

  it("bounds count and assigns unique safe names", () => {
    const result = normalizeAgentFileBindings({
      files: [
        { storageKey: "uploads/user-a/a.csv", filename: "a.csv" },
        { storageKey: "uploads/user-a/b.csv", filename: "a.csv" },
      ],
      userId: "user-a",
    });
    expect(result).toMatchObject({
      ok: true,
      files: [{ filename: "a.csv" }, { filename: "a-1.csv" }],
    });

    expect(
      normalizeAgentFileBindings({
        files: Array.from({ length: 11 }, (_, index) => ({
          storageKey: `uploads/user-a/${index}.txt`,
          filename: `${index}.txt`,
        })),
        userId: "user-a",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});
