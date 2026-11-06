import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER,
  MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG,
  PublishedPageQuotaError,
  PublishedPageSlugOwnershipError,
  selectPublishedPageSnapshotIdsToPrune,
} from "lib/published-page/quota";
import { pgDb } from "../db.pg";
import { PublishedPageTable } from "../schema.pg";

export { PublishedPageQuotaError } from "lib/published-page/quota";

export type PublishedPageEntity = typeof PublishedPageTable.$inferSelect;
export type PublishedPageSummary = Pick<
  PublishedPageEntity,
  "slug" | "version" | "title" | "publishedAt" | "expiresAt" | "revokedAt"
>;

export const pgPublishedPageRepository = {
  async selectLiveBySlug(slug: string, now = new Date()) {
    const [row] = await pgDb
      .select({
        slug: PublishedPageTable.slug,
        title: PublishedPageTable.title,
        html: PublishedPageTable.html,
        version: PublishedPageTable.version,
        expiresAt: PublishedPageTable.expiresAt,
      })
      .from(PublishedPageTable)
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          isNull(PublishedPageTable.revokedAt),
        ),
      )
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);
    if (!row || (row.expiresAt && row.expiresAt <= now)) return undefined;
    return row;
  },

  async selectOwnerIdBySlug(slug: string) {
    const [row] = await pgDb
      .select({ ownerId: PublishedPageTable.ownerId })
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.slug, slug))
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);
    return row?.ownerId;
  },

  async publish(input: {
    slug: string;
    title: string;
    html: string;
    ownerId: string;
    organizationId?: string | null;
    threadId?: string | null;
  }) {
    return pgDb.transaction(async (tx) => {
      // Every publish locks owner before slug. The owner lock serializes quota
      // checks across different slugs owned by the same account.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`published-page-owner:${input.ownerId}`}, 0))`,
      );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`published-page-slug:${input.slug}`}, 0))`,
      );
      const slugRows = await tx
        .select({
          ownerId: PublishedPageTable.ownerId,
          version: PublishedPageTable.version,
        })
        .from(PublishedPageTable)
        .where(eq(PublishedPageTable.slug, input.slug))
        .orderBy(desc(PublishedPageTable.version));
      const foreignSlug = slugRows.some((row) => row.ownerId !== input.ownerId);
      if (foreignSlug) throw new PublishedPageSlugOwnershipError();

      const ownerRows = await tx
        .select({
          id: PublishedPageTable.id,
          slug: PublishedPageTable.slug,
          version: PublishedPageTable.version,
          ownerId: PublishedPageTable.ownerId,
          revokedAt: PublishedPageTable.revokedAt,
          publishedAt: PublishedPageTable.publishedAt,
        })
        .from(PublishedPageTable)
        .where(eq(PublishedPageTable.ownerId, input.ownerId))
        .orderBy(desc(PublishedPageTable.publishedAt));
      const existingVersions = ownerRows
        .filter((row) => row.slug === input.slug)
        .sort((left, right) => right.version - left.version);
      const latest = existingVersions[0];

      const deleteCount = Math.max(
        0,
        ownerRows.length + 1 - MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER,
        existingVersions.length + 1 - MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG,
      );
      if (deleteCount > 0) {
        const pruneIds = selectPublishedPageSnapshotIdsToPrune({
          snapshots: ownerRows,
          slug: input.slug,
          count: deleteCount,
        });
        if (pruneIds.length < deleteCount) throw new PublishedPageQuotaError();
        await tx
          .delete(PublishedPageTable)
          .where(inArray(PublishedPageTable.id, pruneIds));
      }
      const [row] = await tx
        .insert(PublishedPageTable)
        .values({
          slug: input.slug,
          version: (latest?.version ?? 0) + 1,
          title: input.title,
          html: input.html,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          threadId: input.threadId ?? null,
        })
        .returning({
          slug: PublishedPageTable.slug,
          version: PublishedPageTable.version,
        });
      return row;
    });
  },

  async revokeBySlug(slug: string, ownerId: string) {
    const rows = await pgDb
      .update(PublishedPageTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          eq(PublishedPageTable.ownerId, ownerId),
          isNull(PublishedPageTable.revokedAt),
        ),
      )
      .returning({ id: PublishedPageTable.id });
    return rows.length;
  },

  async selectByOwner(ownerId: string): Promise<PublishedPageSummary[]> {
    return pgDb
      .select({
        slug: PublishedPageTable.slug,
        version: PublishedPageTable.version,
        title: PublishedPageTable.title,
        publishedAt: PublishedPageTable.publishedAt,
        expiresAt: PublishedPageTable.expiresAt,
        revokedAt: PublishedPageTable.revokedAt,
      })
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.ownerId, ownerId))
      .orderBy(desc(PublishedPageTable.publishedAt));
  },
};
