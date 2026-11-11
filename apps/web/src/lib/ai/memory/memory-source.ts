import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatMessageTable, MemoryTable } from "lib/db/pg/schema.pg";
import type { MemoryEntity } from "lib/db/pg/schema.pg";
import { truncateForPreview } from "@/components/user/user-detail/memory-ui-helpers";

// Ported from zip-main `src/lib/ai/memory/memory-source.ts` (triage WP6b-T3,
// 2026-11-11): staging ships the memory settings card
// (`components/user/user-detail/memory-settings-card.tsx`) and its helpers,
// but the `/api/user/memory` endpoint and this source-enrichment module were
// never promoted, so the settings UI reads a dead route. Everything this
// module needs already exists in staging (MemoryTable.source_message_id with
// set-null FK, ChatMessageTable, truncateForPreview).

/** The shape of a memory's source message as exposed to the UI. */
export interface MemorySourcePreview {
  threadId: string;
  /** First ~200 chars of the source message content. */
  preview: string;
}

export interface MemoryWithSource extends MemoryEntity {
  /** Source-message info, only present when `sourceMessageId` is set and the
   *  message still exists (it may have been deleted; we silently omit). */
  source?: MemorySourcePreview;
}

/** Maximum length of the source preview that ships down to the client. */
const SOURCE_PREVIEW_MAX = 200;

/** Extract plain text from a UIMessage `parts` array. Tolerates malformed
 *  parts without throwing. */
function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p: unknown) => {
      if (
        p &&
        typeof p === "object" &&
        typeof (p as { text?: unknown }).text === "string"
      ) {
        return (p as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Enrich a list of memories with a `{ threadId, preview }` for each one
 * whose `sourceMessageId` is set. Returns a new array — the input is not
 * mutated.
 *
 * The lookup is one batched `IN` query so the settings page stays O(1)
 * round trips even when the user has hundreds of memories.
 *
 * `userId` is enforced by scoping the memory rows themselves to the
 * requester; the source message is reached through the
 * `source_message_id` FK (`set null` on delete), and the memory rows were
 * already owner-scoped by `memoryRepository.getAll`. A memory with a
 * tampered `sourceMessageId` therefore cannot leak another user's
 * conversation — the joined memory row must belong to the requesting user.
 */
export async function enrichMemoriesWithSource(
  memories: MemoryEntity[],
  userId: string,
): Promise<MemoryWithSource[]> {
  if (memories.length === 0) return memories as MemoryWithSource[];

  const ids = Array.from(
    new Set(
      memories
        .map((m) => m.sourceMessageId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (ids.length === 0) return memories as MemoryWithSource[];

  // One query returning (sourceMessageId, threadId, parts) for the
  // requester's own memories only.
  const rows = await db
    .select({
      sourceMessageId: MemoryTable.sourceMessageId,
      threadId: ChatMessageTable.threadId,
      parts: ChatMessageTable.parts,
    })
    .from(MemoryTable)
    .innerJoin(
      ChatMessageTable,
      eq(ChatMessageTable.id, MemoryTable.sourceMessageId),
    )
    .where(
      and(
        eq(MemoryTable.userId, userId),
        inArray(MemoryTable.sourceMessageId, ids),
      ),
    );

  const sourceMap = new Map<string, { threadId: string; preview: string }>();
  for (const row of rows) {
    if (!row.sourceMessageId) continue;
    const preview = truncateForPreview(
      partsToText(row.parts),
      SOURCE_PREVIEW_MAX,
    );
    sourceMap.set(row.sourceMessageId, { threadId: row.threadId, preview });
  }

  return memories.map((m) => {
    if (!m.sourceMessageId) return m as MemoryWithSource;
    const src = sourceMap.get(m.sourceMessageId);
    if (!src) return m as MemoryWithSource;
    return { ...m, source: src };
  });
}
