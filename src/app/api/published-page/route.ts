import { getSession } from "auth/server";
import { publishedPageRepository, teamRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  PublishedPageQuotaError,
  PublishedPageSlugOwnershipError,
} from "lib/published-page/quota";
import {
  MAX_PUBLISHED_PAGE_HTML_BYTES,
  MAX_PUBLISHED_PAGE_REQUEST_BYTES,
  publishPageSchema,
} from "lib/published-page/schema";
import { buildPageSlug, isValidPageSlug } from "lib/published-page/slug";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession({ disableCookieCache: true });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkApiRateLimit({
    kind: "published-page-create",
    id: userId,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many publish requests" },
      { status: 429 },
    );

  const bytes = await readBoundedRequestBody(
    request,
    MAX_PUBLISHED_PAGE_REQUEST_BYTES,
  );
  if (!bytes)
    return Response.json({ error: "Request body too large" }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = publishPageSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "Invalid publish request" }, { status: 400 });
  if (
    new TextEncoder().encode(parsed.data.html).byteLength >
    MAX_PUBLISHED_PAGE_HTML_BYTES
  ) {
    return Response.json({ error: "Page is too large" }, { status: 413 });
  }

  const activeTeamId = session.session.activeTeamId ?? null;
  if (
    activeTeamId &&
    !(await teamRepository.getTeamMember(activeTeamId, userId))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let slug: string;
  if (parsed.data.slug) {
    if (!isValidPageSlug(parsed.data.slug))
      return Response.json({ error: "Invalid slug" }, { status: 400 });
    let ownerId: string | undefined;
    try {
      ownerId = await publishedPageRepository.selectOwnerIdBySlug(
        parsed.data.slug,
      );
    } catch {
      return Response.json(
        { error: "Failed to verify page owner" },
        { status: 500 },
      );
    }
    if (!ownerId)
      return Response.json({ error: "Unknown page" }, { status: 404 });
    if (ownerId !== userId)
      return Response.json({ error: "Forbidden" }, { status: 403 });
    slug = parsed.data.slug;
  } else {
    slug = buildPageSlug(parsed.data.title);
  }

  try {
    const published = await publishedPageRepository.publish({
      slug,
      title: parsed.data.title,
      html: parsed.data.html,
      ownerId: userId,
      organizationId: activeTeamId,
    });
    return Response.json(
      { ...published, url: `/p/${published.slug}` },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PublishedPageQuotaError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PublishedPageSlugOwnershipError)
      return Response.json(
        { error: "Page cannot be updated by this account" },
        { status: 403 },
      );
    return Response.json({ error: "Failed to publish page" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await checkApiRateLimit({
    kind: "published-page-revoke",
    id: userId,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many revoke requests" },
      { status: 429 },
    );
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug || !isValidPageSlug(slug))
    return Response.json({ error: "Invalid slug" }, { status: 400 });
  // The same response covers pages owned by another user and unavailable
  // pages, so this endpoint does not expose page existence to strangers.
  let revoked: number;
  try {
    revoked = await publishedPageRepository.revokeBySlug(slug, userId);
  } catch {
    return Response.json({ error: "Failed to revoke page" }, { status: 500 });
  }
  if (!revoked)
    return Response.json({ error: "Page not found" }, { status: 404 });
  return Response.json({ revoked });
}
