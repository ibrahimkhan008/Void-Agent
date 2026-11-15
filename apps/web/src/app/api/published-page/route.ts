import { buildPageSlug, isValidPageSlug } from "@/lib/published-page/slug";
import { withAuth } from "auth/route-guard";
import { publishedPageRepository } from "lib/db/repository";
import globalLogger from "logger";
import { z } from "zod";

const logger = globalLogger.withDefaults({ message: "Published page: " });

/** Big enough for a generated landing page, small enough to bound the row. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;

const publishSchema = z.object({
  title: z.string().trim().min(1).max(200),
  html: z.string().min(1),
  threadId: z.uuid().optional(),
  // Republishing an existing page: same slug, new version, same URL.
  slug: z.string().max(64).optional(),
});

export const POST = withAuth(async (request, session) => {
  const parsed = publishSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid publish request" }, { status: 400 });
  }
  const { title, html, threadId, slug: requestedSlug } = parsed.data;

  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
    return Response.json({ error: "Page is too large" }, { status: 413 });
  }

  let slug: string;
  if (requestedSlug) {
    if (!isValidPageSlug(requestedSlug)) {
      return Response.json({ error: "Invalid slug" }, { status: 400 });
    }
    // Republishing must not let one user append a version to someone else's
    // slug — that would silently replace their live page.
    const ownerId =
      await publishedPageRepository.selectOwnerIdBySlug(requestedSlug);
    if (!ownerId) {
      return Response.json({ error: "Unknown page" }, { status: 404 });
    }
    if (ownerId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    slug = requestedSlug;
  } else {
    slug = buildPageSlug(title);
  }

  try {
    const page = await publishedPageRepository.publish({
      slug,
      title,
      html,
      ownerId: session.user.id,
      organizationId: (
        session.session as { activeOrganizationId?: string | null } | undefined
      )?.activeOrganizationId,
      threadId,
    });

    return Response.json({
      slug: page.slug,
      version: page.version,
      url: `/p/${page.slug}`,
    });
  } catch (error) {
    logger.error("Failed to publish page", error);
    return Response.json({ error: "Failed to publish" }, { status: 500 });
  }
});

/** GET — the owner's full deployment history (every version per slug). */
export const GET = withAuth(async (_request, session) => {
  const history = await publishedPageRepository.selectHistoryByOwner(
    session.user.id,
  );
  return Response.json({
    history: history.map((p) => ({
      id: p.id,
      slug: p.slug,
      version: p.version,
      title: p.title,
      viewCount: p.viewCount,
      publishedAt: p.publishedAt.toISOString(),
      revokedAt: p.revokedAt ? p.revokedAt.toISOString() : null,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      badgeVisible: p.badgeVisible,
    })),
  });
});

/**
 * PATCH — attribution badge visibility (§3.9 "visibility controls").
 * Owner-scoped; applies to the latest version of the slug.
 */
export const PATCH = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    badgeVisible?: boolean;
  } | null;
  const slug = body?.slug;
  if (typeof slug !== "string" || typeof body?.badgeVisible !== "boolean") {
    return Response.json(
      { error: "slug and badgeVisible are required" },
      { status: 400 },
    );
  }
  const updated = await publishedPageRepository.setBadgeVisibleBySlug(
    slug,
    session.user.id,
    body.badgeVisible,
  );
  if (!updated) {
    return Response.json({ error: "Page not found" }, { status: 404 });
  }
  return Response.json({ slug, badgeVisible: body.badgeVisible });
});

export const DELETE = withAuth(async (request, session) => {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug || !isValidPageSlug(slug)) {
    return Response.json({ error: "Invalid slug" }, { status: 400 });
  }

  const revoked = await publishedPageRepository.revokeBySlug(
    slug,
    session.user.id,
  );
  if (revoked === 0) {
    // Covers both "not yours" and "already revoked" — deliberately identical,
    // so this endpoint cannot be used to probe which slugs exist.
    return Response.json({ error: "Unknown page" }, { status: 404 });
  }

  return Response.json({ revoked });
});
