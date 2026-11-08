import { and, eq, inArray, or } from "drizzle-orm";
import { WorkflowTable } from "lib/db/pg/schema.pg";

/**
 * Workflow assignments must not make a private workflow visible to project
 * members. Team projects may attach only shared workflows from that team;
 * personal projects may attach the caller's own workflows or public ones.
 */
export function projectWorkflowAccessFilter(
  userId: string,
  teamId: string | null,
) {
  const shared = inArray(WorkflowTable.visibility, ["public", "readonly"]);
  return teamId
    ? and(shared, eq(WorkflowTable.orgId, teamId))
    : or(
        eq(WorkflowTable.userId, userId),
        eq(WorkflowTable.visibility, "public"),
      );
}
