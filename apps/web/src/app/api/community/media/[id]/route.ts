import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import { COMMUNITY_MEDIA_MAX_BYTES } from "lib/community/media-validation";
import { serverFileStorage } from "lib/file-storage";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const GET = withAuth(async (_request, session, { params }) => {
  const limited = await checkApiRateLimit({
    kind: "community-media-read",
    id: session.user.id,
    limit: 120,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limited)
    return NextResponse.json(
      { error: "Media is temporarily unavailable" },
      { status: 503 },
    );
  if (!limited.allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const media = await communityRepository.getAttachedMedia(id);
    if (!media || media.size > COMMUNITY_MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const bytes = await serverFileStorage.downloadLimited(
      media.key,
      COMMUNITY_MEDIA_MAX_BYTES,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": media.contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to read community media", error);
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }
});
