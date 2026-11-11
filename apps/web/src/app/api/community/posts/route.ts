import {
  COMMUNITY_POST_TYPES,
  type CommunityPostType,
} from "app-types/community";
import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z
  .object({
    type: z.enum(COMMUNITY_POST_TYPES),
    content: z.string().trim().min(1).max(5000),
    tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    mediaId: z.string().uuid().optional(),
  })
  .strict();

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await checkApiRateLimit({
    kind: "community-post-create",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limited)
    return NextResponse.json(
      { error: "Community is temporarily unavailable" },
      { status: 503 },
    );
  if (!limited.allowed)
    return NextResponse.json({ error: "Too many posts" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid post payload" },
      { status: 400 },
    );
  }

  try {
    const post = await communityRepository.createPost({
      authorId: session.user.id,
      authorName: session.user.name || "Void-Agent user",
      authorAvatar: session.user.image ?? null,
      type: parsed.data.type as CommunityPostType,
      content: parsed.data.content,
      tags: parsed.data.tags,
      mediaId: parsed.data.mediaId,
    });
    if (!post) {
      return NextResponse.json(
        { error: "Media is unavailable or already attached" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: true, post: { id: post.id } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create community post", error);
    return NextResponse.json(
      { error: "Failed to create community post" },
      { status: 500 },
    );
  }
});
