import { COMMUNITY_TABS, type CommunityFeedTab } from "app-types/community";
import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const activeStreams = new Map<string, number>();

export const GET = withAuth(async (request, session) => {
  const limit = await checkApiRateLimit({
    kind: "community-stream",
    id: session.user.id,
    limit: 12,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limit)
    return NextResponse.json(
      { error: "Community is temporarily unavailable" },
      { status: 503 },
    );
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Too many stream connections" },
      { status: 429 },
    );
  const activeForUser = activeStreams.get(session.user.id) ?? 0;
  if (activeForUser >= 3) {
    return NextResponse.json(
      { error: "Too many active community streams" },
      { status: 429 },
    );
  }
  activeStreams.set(session.user.id, activeForUser + 1);

  const requested = new URL(request.url).searchParams.get("tab");
  const tab = COMMUNITY_TABS.includes(requested as CommunityFeedTab)
    ? (requested as CommunityFeedTab)
    : "For You";
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeStreams.get(session.user.id) ?? 1) - 1;
    if (remaining <= 0) activeStreams.delete(session.user.id);
    else activeStreams.set(session.user.id, remaining);
  };
  let previous = "";
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        release();
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      };
      if (request.signal.aborted) close();
      else request.signal.addEventListener("abort", close, { once: true });

      const poll = async () => {
        if (closed) return;
        if (Date.now() - startedAt >= 22_000) {
          close();
          return;
        }
        try {
          const feed = await communityRepository.listFeed(session.user.id, tab);
          if (closed) return;
          const serialized = JSON.stringify(feed);
          if (serialized !== previous) {
            previous = serialized;
            controller.enqueue(encoder.encode(`data: ${serialized}\n\n`));
          } else {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
        } catch (error) {
          if (closed) return;
          console.error("Community feed stream poll failed", error);
          const data = JSON.stringify({
            error: "Feed temporarily unavailable",
          });
          controller.enqueue(encoder.encode(`event: error\ndata: ${data}\n\n`));
        }
        if (!closed) timer = setTimeout(() => void poll(), 2_500);
      };
      void poll();
    },
    cancel() {
      closed = true;
      release();
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
