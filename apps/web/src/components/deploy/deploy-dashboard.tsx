"use client";

import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Card, CardContent } from "ui/card";

export interface DeployPageRow {
  id: string;
  slug: string;
  version: number;
  title: string;
  viewCount: number;
  publishedAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  badgeVisible?: boolean;
}

/** A full version row for the deployment history (§3.9). */
export interface DeployHistoryRow {
  id: string;
  slug: string;
  version: number;
  title: string;
  viewCount: number;
  publishedAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

/**
 * Void Deploy (master prompt §3.9): the hosting dashboard for published
 * pages — site status, view counts, public links, and revoke controls.
 */
export function DeployDashboard({
  ownerUserId: _ownerUserId,
  organizationId: _organizationId,
  initialPages,
  initialHistory = [],
}: {
  ownerUserId: string;
  organizationId?: string;
  initialPages: DeployPageRow[];
  initialHistory?: DeployHistoryRow[];
}) {
  const [pages, setPages] = useState(initialPages);
  const [history, setHistory] = useState(initialHistory);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [badgeToggling, setBadgeToggling] = useState<string | null>(null);

  const stats = useMemo(() => {
    const live = pages.filter((p) => !p.revokedAt && !isExpired(p));
    return {
      total: pages.length,
      live: live.length,
      views: pages.reduce((sum, p) => sum + p.viewCount, 0),
    };
  }, [pages]);

  const publicUrl = (slug: string) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/p/${slug}`;

  const copyLink = async (page: DeployPageRow) => {
    try {
      await navigator.clipboard.writeText(publicUrl(page.slug));
      setCopied(page.slug);
      toast.success("Public link copied.");
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const revoke = async (page: DeployPageRow) => {
    setRevoking(page.id);
    try {
      const res = await fetch(
        `/api/published-page?slug=${encodeURIComponent(page.slug)}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error();
      setPages((prev) =>
        prev.map((p) =>
          p.slug === page.slug
            ? { ...p, revokedAt: new Date().toISOString() }
            : p,
        ),
      );
      toast.success("Page taken offline.");
    } catch {
      toast.error("Could not take the page offline.");
    } finally {
      setRevoking(null);
    }
  };

  const toggleBadge = async (page: DeployPageRow) => {
    const next = !(page.badgeVisible ?? true);
    setBadgeToggling(page.slug);
    try {
      const res = await fetch("/api/published-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: page.slug, badgeVisible: next }),
      });
      if (!res.ok) throw new Error();
      const apply = (row: { slug: string; version: number }) =>
        row.slug === page.slug ? { ...row, badgeVisible: next } : row;
      setPages((prev) => prev.map(apply));
      setHistory((prev) => prev.map(apply));
      toast.success(
        next ? "Badge enabled." : "Badge hidden — embeds will 404.",
      );
    } catch {
      toast.error("Could not update the badge.");
    } finally {
      setBadgeToggling(null);
    }
  };

  const copyBadgeEmbed = async (page: DeployPageRow) => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const snippet = `<a href="${origin}/p/${page.slug}"><img src="${origin}/p/${page.slug}/badge.svg" alt="Built with Void Agent" width="208" height="28" /></a>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(`${page.slug}-embed`);
      toast.success("Embed snippet copied.");
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            ✳ Void Deploy
          </p>
          <h1 className="text-3xl font-normal tracking-[-0.03em]">
            Hosting dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything published from your workspace — public links, status and
            visitor counts.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Published pages
              </p>
              <p className="mt-1 text-3xl font-medium tabular-nums">
                {stats.total}
              </p>
            </div>
            <Globe className="size-8 text-muted-foreground/40" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Live now
              </p>
              <p className="mt-1 text-3xl font-medium tabular-nums">
                {stats.live}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Online
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total visits
              </p>
              <p className="mt-1 text-3xl font-medium tabular-nums">
                {stats.views}
              </p>
            </div>
            <Eye className="size-8 text-muted-foreground/40" />
          </CardContent>
        </Card>
      </div>

      {/* Pages */}
      <div className="space-y-3">
        {pages.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing published yet. Ask an agent to build a web app, then
              publish it — it will appear here with its public link.
            </CardContent>
          </Card>
        ) : (
          pages.map((page) => {
            const isLive = !page.revokedAt && !isExpired(page);
            return (
              <Card key={page.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {page.title}
                      </p>
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Offline
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      /p/{page.slug} · v{page.version} · {page.viewCount} visits
                      · published{" "}
                      {new Date(page.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isLive && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(page)}
                        >
                          {copied === page.slug ? (
                            <Check className="mr-1.5 size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="mr-1.5 size-3.5" />
                          )}
                          {copied === page.slug ? "Copied" : "Copy link"}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/p/${page.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1.5 size-3.5" />
                            Open
                          </a>
                        </Button>
                      </>
                    )}
                    {isLive && !page.expiresAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={revoking === page.id}
                        onClick={() => revoke(page)}
                        title="Take this page offline"
                      >
                        {revoking === page.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Ban className="mr-1.5 size-3.5" />
                        )}
                        Unpublish
                      </Button>
                    )}
                  </div>
                  <div className="w-full">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setExpanded(expanded === page.slug ? null : page.slug)
                      }
                    >
                      {expanded === page.slug ? "▾" : "▸"} History &amp; badge
                    </button>
                    {expanded === page.slug ? (
                      <div className="mt-2 space-y-2 rounded-xl border p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Deployment history
                        </p>
                        {history
                          .filter((h) => h.slug === page.slug)
                          .map((h) => {
                            const hLive =
                              !h.revokedAt &&
                              (!h.expiresAt ||
                                new Date(h.expiresAt) > new Date());
                            return (
                              <div
                                key={h.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-muted/40"
                              >
                                <span className="font-medium">
                                  v{h.version}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                                    hLive
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {hLive ? "was live" : "offline"}
                                </span>
                                <span className="text-muted-foreground">
                                  {h.viewCount} visits
                                </span>
                                <span className="text-muted-foreground">
                                  {new Date(h.publishedAt).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        <div className="flex flex-wrap items-center gap-3 border-t pt-2">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked={page.badgeVisible ?? true}
                              disabled={badgeToggling === page.slug}
                              onChange={() => toggleBadge(page)}
                            />
                            Attribution badge
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => copyBadgeEmbed(page)}
                          >
                            {copied === `${page.slug}-embed` ? (
                              <Check className="mr-1.5 size-3 text-emerald-600" />
                            ) : (
                              <Copy className="mr-1.5 size-3" />
                            )}
                            Copy embed
                          </Button>
                          <code className="text-[10px] text-muted-foreground">
                            /p/{page.slug}/badge.svg
                          </code>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function isExpired(page: DeployPageRow): boolean {
  return Boolean(page.expiresAt && new Date(page.expiresAt) < new Date());
}
