import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { pgDb } from "../db.pg";
import { PublishedPageTable } from "../schema.pg";

export type PublishedPage = typeof PublishedPageTable.$inferSelect;

/**
 * A published page is readable by anyone holding its slug, so every read here
 * is deliberately unauthenticated. Ownership is enforced only on write and on
 * revoke — see the callers in app/api/published-page.
 */
export const pgPublishedPageRepository = {
  /**
   * The page a visitor should see: newest version of the slug, skipping
   * revoked and expired rows. Returns undefined when there is nothing live,
   * which the route renders as a 404 rather than leaking whether the slug
   * ever existed.
   */
  selectLiveBySlug: async (
    slug: string,
  ): Promise<PublishedPage | undefined> => {
    const [row] = await pgDb
      .select()
      .from(PublishedPageTable)
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          isNull(PublishedPageTable.revokedAt),
        ),
      )
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);

    if (!row) return undefined;
    if (row.expiresAt && row.expiresAt < new Date()) return undefined;
    return row;
  },

  /**
   * Appends a new version for the slug. Never updates in place: the previous
   * version stays readable for rollback, and the slug keeps resolving to
   * whatever is newest.
   */
  publish: async (input: {
    slug: string;
    title: string;
    html: string;
    ownerId: string;
    organizationId?: string | null;
    threadId?: string | null;
    expiresAt?: Date | null;
  }): Promise<PublishedPage> => {
    const [latest] = await pgDb
      .select({
        version: PublishedPageTable.version,
        badgeVisible: PublishedPageTable.badgeVisible,
      })
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.slug, input.slug))
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);

    // A republish INHERITS the badge visibility so it never silently
    // reappears after the owner turned it off.
    const [row] = await pgDb
      .insert(PublishedPageTable)
      .values({
        slug: input.slug,
        version: (latest?.version ?? 0) + 1,
        title: input.title,
        html: input.html,
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        threadId: input.threadId ?? null,
        expiresAt: input.expiresAt ?? null,
        badgeVisible: latest?.badgeVisible ?? true,
      })
      .returning();

    return row;
  },

  /** Who owns a slug, so a write can be refused before it is appended. */
  selectOwnerIdBySlug: async (slug: string): Promise<string | undefined> => {
    const [row] = await pgDb
      .select({ ownerId: PublishedPageTable.ownerId })
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.slug, slug))
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);
    return row?.ownerId;
  },

  /**
   * Takes every version of a slug offline at once. Revoking only the newest
   * would silently republish the previous version, which is the opposite of
   * what someone hitting "unshare" wants.
   */
  revokeBySlug: async (slug: string, ownerId: string): Promise<number> => {
    const rows = await pgDb
      .update(PublishedPageTable)
      .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
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

  selectByOwner: async (ownerId: string): Promise<PublishedPage[]> => {
    return pgDb
      .select()
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.ownerId, ownerId))
      .orderBy(desc(PublishedPageTable.publishedAt));
  },

  /**
   * Deployment history (§3.9): EVERY version the owner has published, slug
   * ascending + version descending. The dashboard surfaces this per page.
   */
  selectHistoryByOwner: async (ownerId: string): Promise<PublishedPage[]> => {
    return pgDb
      .select()
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.ownerId, ownerId))
      .orderBy(PublishedPageTable.slug, desc(PublishedPageTable.version));
  },

  /** Badge visibility toggle (owner-scoped, latest version of the slug). */
  setBadgeVisibleBySlug: async (
    slug: string,
    ownerId: string,
    visible: boolean,
  ): Promise<boolean> => {
    const [latest] = await pgDb
      .select({ version: PublishedPageTable.version })
      .from(PublishedPageTable)
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          eq(PublishedPageTable.ownerId, ownerId),
        ),
      )
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);
    if (!latest) return false;
    const [row] = await pgDb
      .update(PublishedPageTable)
      .set({ badgeVisible: visible })
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          eq(PublishedPageTable.version, latest.version),
        ),
      )
      .returning({ id: PublishedPageTable.id });
    return Boolean(row);
  },

  /**
   * Public badge gate (§3.9): whether the badge endpoint may serve this
   * slug — reads the latest version's flag, no auth (the badge IS public).
   */
  isBadgeVisibleBySlug: async (slug: string): Promise<boolean> => {
    const [latest] = await pgDb
      .select({ badgeVisible: PublishedPageTable.badgeVisible })
      .from(PublishedPageTable)
      .where(eq(PublishedPageTable.slug, slug))
      .orderBy(desc(PublishedPageTable.version))
      .limit(1);
    return latest?.badgeVisible ?? false;
  },

  // Fire-and-forget from the public /p/[slug] render: failure must never
  // break the visit, so callers wrap this in a catch.
  incrementViewBySlug: async (slug: string): Promise<void> => {
    await pgDb
      .update(PublishedPageTable)
      .set({ viewCount: sql`${PublishedPageTable.viewCount} + 1` })
      .where(
        and(
          eq(PublishedPageTable.slug, slug),
          isNull(PublishedPageTable.revokedAt),
        ),
      );
  },
};
