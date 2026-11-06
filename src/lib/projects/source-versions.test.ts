import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ProjectBrainFactTable } from "lib/db/pg/schema.pg";
import { projectBrainSourceFingerprint } from "./brain-schema";
import { projectBrainRunIsActiveSourceRevision } from "./brain-source-state";
import {
  ensureProjectBrainSourceVersion,
  resolveProjectBrainSourceSnapshot,
} from "./source-versions";

const contentSnapshot = "The project deadline is December 4.";
const input = {
  projectId: "00000000-0000-4000-8000-000000000001",
  sourceItemId: "00000000-0000-4000-8000-000000000002",
  sourceFingerprint: projectBrainSourceFingerprint(
    "00000000-0000-4000-8000-000000000002",
    contentSnapshot,
  ),
  contentSnapshot,
};

function makeExecutor(options?: {
  inserted?: Array<{ id: string }>;
  existing?: Array<{
    id: string;
    contentLength: number;
    contentSnapshot: string | null;
  }>;
}) {
  const returning = vi.fn().mockResolvedValue(options?.inserted ?? []);
  const limit = vi.fn().mockResolvedValue(options?.existing ?? []);
  const upsert = vi.fn().mockResolvedValue([]);
  const executor = {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      onConflictDoUpdate: upsert,
      returning,
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit,
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
  };
  return { executor, returning, limit, upsert };
}

describe("ensureProjectBrainSourceVersion", () => {
  it("inserts and returns a new revision ID", async () => {
    const { executor, upsert } = makeExecutor({
      inserted: [{ id: "version-1" }],
    });

    await expect(
      ensureProjectBrainSourceVersion(executor as never, input),
    ).resolves.toBe("version-1");
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      set: { sourceVersionId: "version-1" },
    });
  });

  it("reuses an existing revision only when its recorded length and snapshot match", async () => {
    const { executor, upsert } = makeExecutor({
      existing: [
        {
          id: "version-existing",
          contentLength: contentSnapshot.length,
          contentSnapshot,
        },
      ],
    });

    await expect(
      ensureProjectBrainSourceVersion(executor as never, input),
    ).resolves.toBe("version-existing");
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("rejects fingerprint metadata conflicts and unsupported source lengths", async () => {
    const { executor, limit } = makeExecutor({
      existing: [
        {
          id: "version-existing",
          contentLength: contentSnapshot.length - 1,
          contentSnapshot,
        },
      ],
    });

    await expect(
      ensureProjectBrainSourceVersion(executor as never, input),
    ).rejects.toThrow("metadata conflicts");
    await expect(
      ensureProjectBrainSourceVersion(executor as never, {
        ...input,
        contentSnapshot: "x".repeat(60_001),
      }),
    ).rejects.toThrow("outside the supported bound");
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("fills an exact snapshot for a legacy row with unknown content length", async () => {
    const { executor } = makeExecutor({
      existing: [
        { id: "legacy-version", contentLength: 0, contentSnapshot: null },
      ],
    });
    await expect(
      ensureProjectBrainSourceVersion(executor as never, input),
    ).resolves.toBe("legacy-version");
    expect(executor.update).toHaveBeenCalledTimes(1);
  });

  it("rejects content that does not match the supplied fingerprint", async () => {
    const { executor } = makeExecutor();
    await expect(
      ensureProjectBrainSourceVersion(executor as never, {
        ...input,
        contentSnapshot: "different text",
      }),
    ).rejects.toThrow("fingerprint does not match its content");
    expect(executor.insert).not.toHaveBeenCalled();
  });
});

describe("resolveProjectBrainSourceSnapshot", () => {
  it("uses the immutable queued revision even if the current document changed", () => {
    expect(
      resolveProjectBrainSourceSnapshot({
        sourceItemId: input.sourceItemId,
        sourceFingerprint: input.sourceFingerprint,
        contentLength: contentSnapshot.length,
        contentSnapshot,
        currentSourceText: "The project deadline changed to January 2.",
      }),
    ).toBe(contentSnapshot);
  });

  it("rejects a changed current document when recovering a legacy metadata-only row", () => {
    expect(() =>
      resolveProjectBrainSourceSnapshot({
        sourceItemId: input.sourceItemId,
        sourceFingerprint: input.sourceFingerprint,
        contentLength: 0,
        contentSnapshot: null,
        currentSourceText: "The project deadline changed to January 2.",
      }),
    ).toThrow("source changed after this analysis was queued");
  });

  it("rejects a snapshot that does not match its fingerprint or recorded length", () => {
    expect(() =>
      resolveProjectBrainSourceSnapshot({
        sourceItemId: input.sourceItemId,
        sourceFingerprint: input.sourceFingerprint,
        contentLength: contentSnapshot.length,
        contentSnapshot: "forged source content",
        currentSourceText: contentSnapshot,
      }),
    ).toThrow("source changed after this analysis was queued");
  });
});

describe("projectBrainRunIsActiveSourceRevision", () => {
  it("compiles a correlated run-to-active-version guard", () => {
    const compiled = new PgDialect().sqlToQuery(
      projectBrainRunIsActiveSourceRevision(
        ProjectBrainFactTable.runId,
        ProjectBrainFactTable.projectId,
        ProjectBrainFactTable.sourceItemId,
      ),
    );
    expect(compiled.sql).toContain('"project_brain_source_state"');
    expect(compiled.sql).toContain(
      "active_source.source_version_id = active_run.source_version_id",
    );
    expect(compiled.sql).toContain(
      "active_source.updated_at >= (\n        SELECT source_item.updated_at",
    );
    expect(compiled.sql).toContain('"project_brain_fact"."run_id"');
  });
});
