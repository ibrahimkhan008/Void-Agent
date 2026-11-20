import "server-only";
import { pgDb } from "@/lib/db/pg/db.pg";
import { ScheduledTaskTable } from "@/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";
import logger from "logger";

/**
 * The per-task grants an unattended run carries.
 *
 * Read from the `scheduled_task` row rather than the request body: these are
 * authorization decisions (may this run drive a browser, which stored
 * credentials may it use), and authorization must not travel inside the
 * request it authorizes. The loopback sends only the task id, in a header that
 * is read after `SCHEDULED_TASK_SECRET` has been verified.
 */
export type UnattendedRunContext = {
  taskId: string | null;
  browserAutomationEnabled: boolean;
  credentialAliases: string[];
  /**
   * The task's execution mode, read from the same row as the browser grants.
   * A `cloud-agent` value is what makes the chat route enforce the E2B code
   * toolkit on the run (see `resolveUnattendedToolkits`); `null` is the
   * fail-closed value, so a failed read grants no sandbox enforcement.
   */
  executionMode: "agent" | "chat" | "cloud-agent" | null;
};

/** Everything denied. The value every failure path returns. */
export const DENIED_UNATTENDED_CONTEXT: UnattendedRunContext = {
  taskId: null,
  browserAutomationEnabled: false,
  credentialAliases: [],
  executionMode: null,
};

/**
 * Load one scheduled task's grants, scoped to its owner.
 *
 * Fails closed on anything unexpected — a missing id, a row that belongs to
 * someone else, a read that throws — because the safe default for "sign into a
 * website unsupervised" is no.
 */
export async function loadUnattendedContext(input: {
  scheduledTaskId: string | null;
  userId: string;
}): Promise<UnattendedRunContext> {
  if (!input.scheduledTaskId) return DENIED_UNATTENDED_CONTEXT;

  try {
    const [row] = await pgDb
      .select({
        id: ScheduledTaskTable.id,
        browserAutomationEnabled: ScheduledTaskTable.browserAutomationEnabled,
        browserCredentialAliases: ScheduledTaskTable.browserCredentialAliases,
        executionMode: ScheduledTaskTable.executionMode,
      })
      .from(ScheduledTaskTable)
      .where(
        and(
          eq(ScheduledTaskTable.id, input.scheduledTaskId),
          // The secret proves the caller is the runner; this proves the task is
          // the one that user owns. Cheap, and it keeps a wrong id from
          // borrowing another account's grants.
          eq(ScheduledTaskTable.userId, input.userId),
        ),
      )
      .limit(1);

    if (!row) return DENIED_UNATTENDED_CONTEXT;

    return {
      taskId: row.id,
      browserAutomationEnabled: row.browserAutomationEnabled ?? false,
      credentialAliases: row.browserCredentialAliases ?? [],
      executionMode: row.executionMode ?? null,
    };
  } catch (error) {
    logger.error(
      "[scheduled-tasks] could not load unattended run context",
      error instanceof Error ? error.message : error,
    );
    return DENIED_UNATTENDED_CONTEXT;
  }
}
