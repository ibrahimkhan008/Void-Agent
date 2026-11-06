"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";

type PageVersion = {
  slug: string;
  version: number;
  title: string;
  publishedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export default function PublishedPagesDashboard() {
  const [pages, setPages] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/published-pages", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load published pages");
    const body = (await response.json()) as { pages: PageVersion[] };
    setPages(body.pages);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load pages",
        ),
      )
      .finally(() => setLoading(false));
  }, [refresh]);

  const latestPages = useMemo(() => {
    const latest = new Map<string, PageVersion>();
    for (const page of pages) {
      const current = latest.get(page.slug);
      if (!current || page.version > current.version)
        latest.set(page.slug, page);
    }
    return [...latest.values()].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
  }, [pages]);

  const revoke = async (slug: string) => {
    if (!window.confirm("Anyone with this link will lose access. Revoke it?"))
      return;
    setBusySlug(slug);
    try {
      const response = await fetch(
        `/api/published-page?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not revoke this page");
      toast.success("Public link revoked");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not revoke this page",
      );
    } finally {
      setBusySlug(null);
    }
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(
        new URL(`/p/${slug}`, window.location.origin).toString(),
      );
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Published pages</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pages published from chat are visible to anyone who has the unlisted
        link. Revoke a link here to take every version offline.
      </p>
      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading pages…</p>
      ) : latestPages.length === 0 ? (
        <p className="mt-8 rounded-lg border p-6 text-sm text-muted-foreground">
          No pages have been published yet. Ask Void-Agent to publish a
          standalone page from chat.
        </p>
      ) : (
        <ul className="mt-8 divide-y rounded-xl border">
          {latestPages.map((page) => {
            const expired =
              page.expiresAt !== null &&
              Date.parse(page.expiresAt) <= Date.now();
            const live = !page.revokedAt && !expired;
            return (
              <li
                key={page.slug}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{page.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Version {page.version} · Published{" "}
                    {new Date(page.publishedAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {page.revokedAt ? "Revoked" : expired ? "Expired" : "Live"}
                </span>
                {live && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copy(page.slug)}
                    >
                      Copy link
                    </Button>
                    <Button size="sm" asChild>
                      <Link
                        href={`/p/${page.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busySlug === page.slug}
                      onClick={() => void revoke(page.slug)}
                    >
                      {busySlug === page.slug ? "Revoking…" : "Revoke"}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
