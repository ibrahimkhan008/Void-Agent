import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.discriminatedUnion("type", [
  z
    .object({ type: z.enum(["like", "bookmark"]), active: z.boolean() })
    .strict(),
  z.object({ type: z.literal("share") }).strict(),
]);

export const POST = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await checkApiRateLimit({
    kind: "community-reaction",
    id: session.user.id,
    limit: 120,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limited)
    return NextResponse.json(
      { error: "Community is temporarily unavailable" },
      { status: 503 },
    );
  if (!limited.allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Invalid post id" }, { status: 400 });

  try {
    const exists =
      parsed.data.type === "share"
        ? await communityRepository.incrementShare(id)
        : await communityRepository.setReaction({
            postId: id,
            userId: session.user.id,
            type: parsed.data.type,
            active: parsed.data.active,
          });
    if (!exists)
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update community reaction", error);
    return NextResponse.json(
      { error: "Failed to update reaction" },
      { status: 500 },
    );
  }
});
