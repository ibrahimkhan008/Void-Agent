import {
  type SentinelMode,
  isSentinelMode,
  sentinelRepository,
} from "@/lib/db/pg/repositories/sentinel-repository.pg";
import { withAuth } from "auth/route-guard";
import { publishedPageRepository } from "lib/db/pg/repositories/published-page-repository.pg";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,200}$/u;

/** GET /api/sentinel/monitors — the user's monitors + incident history. */
export const GET = withAuth(async (_request, session) => {
  const [monitors, incidents] = await Promise.all([
    sentinelRepository.listMonitors(session.user.id),
    sentinelRepository.listIncidents(session.user.id),
  ]);
  return NextResponse.json({ monitors, incidents });
});

/** POST /api/sentinel/monitors — attach a Sentinel to one published site. */
export const POST = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    mode?: string;
    assertions?: Array<{ type?: string; value?: string }>;
    intervalSeconds?: number;
  } | null;
  if (!body?.slug || !SLUG_PATTERN.test(body.slug)) {
    return NextResponse.json(
      { error: "slug is required (letters, digits, - and _)" },
      { status: 400 },
    );
  }
  if (!isSentinelMode(body.mode)) {
    return NextResponse.json(
      { error: "mode must be monitor, suggest, repair_approval or autonomous" },
      { status: 400 },
    );
  }
  // Only the site's owner can attach a Sentinel to it.
  const ownerId = await publishedPageRepository.selectOwnerIdBySlug(body.slug);
  if (ownerId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only monitor sites you published" },
      { status: 403 },
    );
  }
  const assertions = (body.assertions ?? [])
    .filter(
      (item): item is { type: "contains" | "not_contains"; value: string } =>
        (item?.type === "contains" || item?.type === "not_contains") &&
        typeof item.value === "string" &&
        item.value.length > 0 &&
        item.value.length <= 500,
    )
    .slice(0, 10);
  const intervalSeconds =
    typeof body.intervalSeconds === "number" &&
    body.intervalSeconds >= 60 &&
    body.intervalSeconds <= 86400
      ? Math.round(body.intervalSeconds)
      : 300;

  const monitor = await sentinelRepository.createMonitor(session.user.id, {
    slug: body.slug,
    mode: body.mode as SentinelMode,
    assertions,
    intervalSeconds,
  });
  return NextResponse.json({ monitor });
});
