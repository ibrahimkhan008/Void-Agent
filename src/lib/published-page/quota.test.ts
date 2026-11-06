import { describe, expect, it } from "vitest";
import {
  MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG,
  selectPublishedPageSnapshotIdsToPrune,
} from "./quota";

describe("published page snapshot quota", () => {
  it("prunes only the oldest same-page snapshot to retain the newest ten versions", () => {
    const snapshots = Array.from(
      { length: MAX_PUBLISHED_PAGE_VERSIONS_PER_SLUG },
      (_, index) => ({
        id: `version-${index + 1}`,
        slug: "same-page",
        version: index + 1,
        revokedAt: null,
        publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
      }),
    );
    expect(
      selectPublishedPageSnapshotIdsToPrune({
        snapshots,
        slug: "same-page",
        count: 1,
      }),
    ).toEqual(["version-1"]);
  });

  it("reclaims oldest revoked pages before touching any active page", () => {
    const snapshots = [
      {
        id: "active",
        slug: "active-page",
        version: 1,
        revokedAt: null,
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "revoked-newer",
        slug: "revoked-newer-page",
        version: 1,
        revokedAt: new Date("2026-02-01T00:00:00Z"),
        publishedAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: "revoked-oldest",
        slug: "revoked-oldest-page",
        version: 1,
        revokedAt: new Date("2026-01-02T00:00:00Z"),
        publishedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ];
    expect(
      selectPublishedPageSnapshotIdsToPrune({
        snapshots,
        slug: "new-page",
        count: 1,
      }),
    ).toEqual(["revoked-oldest"]);
  });
});
