/** Each stored snapshot is bounded to 2 MiB; this caps an owner's stored HTML at 100 MiB. */
export const MAX_PUBLISHED_PAGE_VERSIONS_PER_OWNER = 50;
/** Republish keeps the current snapshot and at most nine previous versions. */
export const MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG = 10;

export class PublishedPageQuotaError extends Error {
  constructor() {
    super(
      "Published page snapshot quota reached. Revoke an unused page and retry.",
    );
    this.name = "PublishedPageQuotaError";
  }
}

export class PublishedPageSlugOwnershipError extends Error {
  constructor() {
    super("This published page belongs to another account.");
    this.name = "PublishedPageSlugOwnershipError";
  }
}

export interface PublishedPageSnapshotReference {
  id: string;
  slug: string;
  version: number;
  revokedAt: Date | null;
  publishedAt: Date;
}

/** Choose oldest same-page history first, then oldest revoked snapshots. */
export function selectPublishedPageSnapshotIdsToPrune(input: {
  snapshots: PublishedPageSnapshotReference[];
  slug: string;
  count: number;
}) {
  if (!Number.isSafeInteger(input.count) || input.count < 0) return [];
  const samePageHistory = input.snapshots
    .filter((snapshot) => snapshot.slug === input.slug)
    .sort((left, right) => left.version - right.version);
  const revokedHistory = input.snapshots
    .filter(
      (snapshot) => snapshot.slug !== input.slug && snapshot.revokedAt !== null,
    )
    .sort(
      (left, right) => left.publishedAt.getTime() - right.publishedAt.getTime(),
    );
  return [...samePageHistory, ...revokedHistory]
    .slice(0, input.count)
    .map((snapshot) => snapshot.id);
}
