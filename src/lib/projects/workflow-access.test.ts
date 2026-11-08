import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { projectWorkflowAccessFilter } from "./workflow-access";

describe("projectWorkflowAccessFilter", () => {
  it("allows personal owners and public workflows, never another private workflow", () => {
    const query = new PgDialect().sqlToQuery(
      projectWorkflowAccessFilter("user-1", null) as never,
    );
    expect(query.sql).toContain('"workflow"."user_id"');
    expect(query.params).toContain("user-1");
    expect(query.sql).toContain('"workflow"."visibility"');
    expect(query.params).toContain("public");
  });

  it("restricts team assignments to shared workflows in the same team", () => {
    const query = new PgDialect().sqlToQuery(
      projectWorkflowAccessFilter("user-1", "team-1") as never,
    );
    expect(query.sql).toContain('"workflow"."visibility"');
    expect(query.params).toEqual(
      expect.arrayContaining(["public", "readonly", "team-1"]),
    );
    expect(query.sql).toContain('"workflow"."org_id"');
    expect(query.sql).not.toContain('"workflow"."user_id"');
  });
});
