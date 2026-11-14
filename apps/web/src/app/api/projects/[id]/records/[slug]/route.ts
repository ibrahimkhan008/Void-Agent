import {
  type ProjectRecordSlug,
  PROJECT_RECORDS,
  listRecordRevisions,
  restoreRecordRevision,
  saveProjectRecord,
  setProjectRecordContext,
} from "@/lib/db/pg/repositories/project-records-repository.pg";
import {
  requireProjectAccess,
  toProjectErrorResponse,
} from "@/lib/projects/access";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; slug: string }> };

const VALID_SLUGS = new Set<string>(PROJECT_RECORDS.map((r) => r.slug));

function validateSlug(slug: string): asserts slug is ProjectRecordSlug {
  if (!VALID_SLUGS.has(slug)) {
    throw Object.assign(new Error(`Unknown record: ${slug}`), {
      status: 404,
      code: "record_not_found",
    });
  }
}

/** GET — the record's current content + full revision history. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: projectId, slug } = await params;
    validateSlug(slug);
    await requireProjectAccess({ projectId });
    const revisions = await listRecordRevisions(projectId, slug);
    const current = revisions[0];
    return NextResponse.json({
      slug,
      content: current?.content ?? "",
      revision: current?.revision ?? 0,
      revisions,
    });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}

/** PUT — save a new revision (editors and above). */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id: projectId, slug } = await params;
    validateSlug(slug);
    const { actor, role } = await requireProjectAccess({
      projectId,
      minRole: "editor",
    });

    const body = (await request.json().catch(() => null)) as {
      content?: string;
      changeNote?: string;
    } | null;
    const content = body?.content;
    if (typeof content !== "string" || content.length > 500_000) {
      return NextResponse.json(
        { error: "Invalid record content." },
        { status: 400 },
      );
    }

    const result = await saveProjectRecord(
      projectId,
      slug,
      content,
      body?.changeNote ?? null,
      actor.userId,
    );
    return NextResponse.json({ ok: true, revision: result.revision, role });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}

/** POST — restore an old revision by appending it as a new one (editors+). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: projectId, slug } = await params;
    validateSlug(slug);
    const { actor, role } = await requireProjectAccess({
      projectId,
      minRole: "editor",
    });

    const body = (await request.json().catch(() => null)) as {
      revision?: number;
    } | null;
    const revision = Number(body?.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      return NextResponse.json({ error: "Invalid revision." }, { status: 400 });
    }

    const result = await restoreRecordRevision(
      projectId,
      slug,
      revision,
      actor.userId,
    );
    return NextResponse.json({ ok: true, revision: result.revision, role });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}

/** PATCH — per-record retrieval tuning (include in the agent's context). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: projectId, slug } = await params;
    validateSlug(slug);
    await requireProjectAccess({ projectId, minRole: "editor" });
    const body = (await request.json().catch(() => null)) as {
      includeInContext?: boolean;
    } | null;
    if (typeof body?.includeInContext !== "boolean") {
      return NextResponse.json(
        { error: "includeInContext is required" },
        { status: 400 },
      );
    }
    await setProjectRecordContext(projectId, slug, body.includeInContext);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}
