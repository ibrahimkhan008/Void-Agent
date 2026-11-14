import {
  USER_RECORDS,
  type UserRecordSlug,
  listUserRecordRevisions,
  saveUserRecord,
  setUserRecordContext,
} from "@/lib/db/pg/repositories/user-records-repository.pg";
import { withAuth } from "auth/route-guard";

const VALID_SLUGS = new Set<string>(USER_RECORDS.map((r) => r.slug));

function validateSlug(slug: string): asserts slug is UserRecordSlug {
  if (!VALID_SLUGS.has(slug)) {
    throw Object.assign(new Error(`Unknown record: ${slug}`), {
      status: 404,
      code: "record_not_found",
    });
  }
}

/** GET — the record's current content + full revision history. */
export const GET = withAuth(async (_request, _session, { params }) => {
  const { slug } = await params;
  validateSlug(slug);
  const revisions = await listUserRecordRevisions(_session.user.id, slug);
  const current = revisions[0];
  return Response.json({
    slug,
    content: current?.content ?? "",
    revision: current?.revision ?? 0,
    revisions,
  });
});

/** PUT — save a new revision of a global record. */
export const PUT = withAuth(async (request, session, { params }) => {
  const { slug } = await params;
  validateSlug(slug);
  const body = (await request.json().catch(() => null)) as {
    content?: string;
    changeNote?: string;
  } | null;
  if (typeof body?.content !== "string" || !body.content.trim()) {
    return Response.json({ error: "Content is required" }, { status: 400 });
  }
  if (body.content.length > 500_000) {
    return Response.json({ error: "Content too large" }, { status: 413 });
  }
  const { revision } = await saveUserRecord(
    session.user.id,
    slug,
    body.content,
    body.changeNote?.trim() || null,
  );
  return Response.json({ revision });
});

/** PATCH — per-record retrieval tuning (include in the agent's context). */
export const PATCH = withAuth(async (request, session, { params }) => {
  const { slug } = await params;
  validateSlug(slug);
  const body = (await request.json().catch(() => null)) as {
    includeInContext?: boolean;
  } | null;
  if (typeof body?.includeInContext !== "boolean") {
    return Response.json(
      { error: "includeInContext is required" },
      { status: 400 },
    );
  }
  await setUserRecordContext(session.user.id, slug, body.includeInContext);
  return Response.json({ ok: true });
});

/** POST — restore an older revision as a new revision. */
export const POST = withAuth(async (request, session, { params }) => {
  const { slug } = await params;
  validateSlug(slug);
  const body = (await request.json().catch(() => null)) as {
    revision?: number;
  } | null;
  const target = body?.revision;
  if (typeof target !== "number") {
    return Response.json({ error: "revision is required" }, { status: 400 });
  }
  const revisions = await listUserRecordRevisions(session.user.id, slug);
  const match = revisions.find((r) => r.revision === target);
  if (!match) {
    return Response.json({ error: "Revision not found" }, { status: 404 });
  }
  const { revision } = await saveUserRecord(
    session.user.id,
    slug,
    match.content,
    `Restored revision ${target}`,
  );
  return Response.json({ revision });
});
