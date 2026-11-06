import { getTableConfig } from "drizzle-orm/pg-core";
import { ProjectBrainFactTable } from "lib/db/pg/schema.pg";
import { describe, expect, it } from "vitest";

describe("project brain fact source revision linkage", () => {
  it("requires every fact to reference the revision for its exact project and source item", () => {
    const config = getTableConfig(ProjectBrainFactTable);
    const relation = config.foreignKeys.find(
      (foreignKey) =>
        foreignKey.getName() === "project_brain_fact_source_revision_fk",
    );
    expect(relation).toBeDefined();
    const reference = relation?.reference();
    expect(reference?.columns.map((column) => column.name)).toEqual([
      "source_version_id",
      "project_id",
      "source_item_id",
    ]);
    expect(reference?.foreignColumns.map((column) => column.name)).toEqual([
      "id",
      "project_id",
      "source_item_id",
    ]);
  });

  it("exposes the source revision as a required fact field", () => {
    expect(ProjectBrainFactTable.sourceVersionId.name).toBe(
      "source_version_id",
    );
    expect(ProjectBrainFactTable.sourceVersionId.notNull).toBe(true);
  });
});
