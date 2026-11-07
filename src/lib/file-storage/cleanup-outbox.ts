import "server-only";

import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { FileCleanupOutboxTable } from "lib/db/pg/schema.pg";
import { serverFileStorage } from "lib/file-storage";
import { isUserStorageKey } from "lib/file-storage/storage-utils";

const BATCH_SIZE = 20;
const LEASE_MS = 5 * 60_000;

export type CleanupBatchResult = {
  completed: number;
  failed: number;
  errors: string[];
};

/**
 * Process durable object cleanup requests. Each claim is leased in a short
 * transaction, while object storage is called only after that transaction
 * commits. A failed delete remains pending with a visible error and retry
 * time; delete is idempotent so an expired lease can safely be retried.
 */
export async function processFileCleanupOutbox(
  onlyId?: string,
): Promise<CleanupBatchResult> {
  const now = new Date();
  const claimed = await pgDb.transaction(async (tx) => {
    const due = and(
      inArray(FileCleanupOutboxTable.status, ["pending", "processing"]),
      lte(FileCleanupOutboxTable.nextAttemptAt, now),
      onlyId ? eq(FileCleanupOutboxTable.id, onlyId) : sql`true`,
    );
    const rows = await tx
      .select()
      .from(FileCleanupOutboxTable)
      .where(due)
      .orderBy(FileCleanupOutboxTable.createdAt)
      .limit(onlyId ? 1 : BATCH_SIZE)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    for (const row of rows) {
      await tx
        .update(FileCleanupOutboxTable)
        .set({
          status: "processing",
          attempts: row.attempts + 1,
          nextAttemptAt: leaseUntil,
          updatedAt: now,
        })
        .where(eq(FileCleanupOutboxTable.id, row.id));
    }
    return rows.map((row) => ({ ...row, attempts: row.attempts + 1 }));
  });

  const result: CleanupBatchResult = { completed: 0, failed: 0, errors: [] };
  for (const task of claimed) {
    try {
      // The outbox stores a key only after ownership validation. Revalidate at
      // the irreversible boundary in case corrupted data was inserted.
      if (!isUserStorageKey(task.storageKey, task.userId)) {
        throw new Error(
          "Refusing to delete a storage key outside its owner's prefix",
        );
      }
      if (await serverFileStorage.exists(task.storageKey)) {
        await serverFileStorage.delete(task.storageKey);
      }
      await pgDb
        .update(FileCleanupOutboxTable)
        .set({ status: "complete", lastError: null, updatedAt: new Date() })
        .where(eq(FileCleanupOutboxTable.id, task.id));
      result.completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delay = Math.min(
        60 * 60_000,
        15_000 * 2 ** Math.min(task.attempts - 1, 8),
      );
      await pgDb
        .update(FileCleanupOutboxTable)
        .set({
          status: "pending",
          lastError: message.slice(0, 2_000),
          nextAttemptAt: new Date(Date.now() + delay),
          updatedAt: new Date(),
        })
        .where(eq(FileCleanupOutboxTable.id, task.id));
      result.failed++;
      result.errors.push(`${task.id}: ${message}`);
    }
  }
  return result;
}
