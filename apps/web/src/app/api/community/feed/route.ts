import { COMMUNITY_TABS, type CommunityFeedTab } from "app-types/community";
import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request, session) => {
  const limited = await checkApiRateLimit({
    kind: "community-feed",
    id: session.user.id,
    limit: 120,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limited) {
    return NextResponse.json(
      { error: "Community is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const requested = new URL(request.url).searchParams.get("tab");
  const tab = COMMUNITY_TABS.includes(requested as CommunityFeedTab)
    ? (requested as CommunityFeedTab)
    : "For You";
  try {
    const feed = await communityRepository.listFeed(session.user.id, tab);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Failed to load community feed", error);
    return NextResponse.json(
      { error: "Failed to load community feed" },
      { status: 500 },
    );
  }
});
