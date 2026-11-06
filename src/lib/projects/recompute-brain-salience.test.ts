import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { execute: mocks.execute } }));
vi.mock("server-only", () => ({}));

import { recomputeProjectBrainSalience } from "./recompute-brain-salience";

beforeEach(() => vi.clearAllMocks());

describe("recomputeProjectBrainSalience", () => {
  it("only scores accepted facts from active, ready, attached owner sources", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ id: "page-1" }, { id: "page-2" }],
    });
    const result = await recomputeProjectBrainSalience({
      projectId: "00000000-0000-4000-8000-000000000001",
      collectionIds: ["00000000-0000-4000-8000-000000000002"],
      ownerIds: ["00000000-0000-4000-8000-000000000003"],
    });
    expect(result).toEqual({ updated: 2 });
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain("f.review_status = 'accepted'");
    expect(query.sql).toContain("ci.status = 'ready'");
    expect(query.sql).toContain(
      "active_source.source_version_id = active_run.source_version_id",
    );
    expect(query.sql).toContain("active_source.updated_at >= ci.updated_at");
    expect(query.sql).toContain("c.id = ANY(");
    expect(query.sql).toContain("c.user_id = ANY(");
    expect(query.sql).toContain("DISTINCT f.source_item_id");
    expect(query.sql).toContain("ln(1 + coalesce(d.degree, 0))");
  });

  it("does not query when no visible collections or owners are available", async () => {
    await expect(
      recomputeProjectBrainSalience({
        projectId: "project",
        collectionIds: [],
        ownerIds: ["owner"],
      }),
    ).resolves.toEqual({ updated: 0 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
