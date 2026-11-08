import { getSession } from "auth/server";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainAliasTable,
  ProjectBrainFactTable,
  ProjectBrainPagePairReviewTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import {
  archiveStaleProjectBrainPage,
  listRestorableProjectBrainPages,
  listStaleProjectBrainPages,
  restoreProjectBrainPage,
} from "lib/projects/brain-page-archive";
import { findBrainPageDuplicateCandidates } from "lib/projects/brain-page-duplicate-candidates";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { mergeProjectBrainPages } from "lib/projects/merge-brain-pages";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const projectIdSchema = z.string().uuid();
const mergeRequestSchema = z
  .object({
    survivorPageId: z.string().uuid(),
    mergedPageId: z.string().uuid(),
  })
  .strict();
const pageReviewRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("not_same"),
      firstPageId: z.string().uuid(),
      secondPageId: z.string().uuid(),
    })
    .strict(),
  z
    .object({ action: z.literal("archive_stale"), pageId: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("restore"), pageId: z.string().uuid() })
    .strict(),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });

  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length) {
    return Response.json(
      {
        pages: [],
        duplicateCandidates: [],
        stalePages: [],
        restorablePages: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await pgDb
    .selectDistinct({
      id: ProjectBrainPageTable.id,
      title: ProjectBrainPageTable.title,
      entityType: ProjectBrainPageTable.entityType,
      normalizedTitle: ProjectBrainPageTable.normalizedTitle,
      salience: ProjectBrainPageTable.salience,
      createdAt: ProjectBrainPageTable.createdAt,
      updatedAt: ProjectBrainPageTable.updatedAt,
    })
    .from(ProjectBrainPageTable)
    .innerJoin(
      ProjectBrainFactTable,
      eq(ProjectBrainFactTable.subjectPageId, ProjectBrainPageTable.id),
    )
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, projectId),
        isNull(ProjectBrainPageTable.archivedAt),
        eq(ProjectBrainFactTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
        ),
        eq(ProjectBrainFactTable.predicate, "entity type"),
        eq(ProjectBrainFactTable.object, ProjectBrainPageTable.entityType),
        eq(ProjectBrainFactTable.reviewStatus, "accepted"),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .orderBy(
      desc(ProjectBrainPageTable.salience),
      asc(ProjectBrainPageTable.title),
      asc(ProjectBrainPageTable.id),
    )
    .limit(300);

  const pageById = new Map(
    rows.map((page) => [page.id, { ...page, aliases: [] as string[] }]),
  );
  const pageIds = [...pageById.keys()];
  if (pageIds.length) {
    const aliasRows = await pgDb
      .select({
        pageId: ProjectBrainAliasTable.pageId,
        alias: ProjectBrainAliasTable.alias,
      })
      .from(ProjectBrainAliasTable)
      .innerJoin(
        ProjectBrainFactTable,
        eq(ProjectBrainFactTable.id, ProjectBrainAliasTable.sourceFactId),
      )
      .innerJoin(
        CollectionItemTable,
        eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
      )
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(
        and(
          eq(ProjectBrainAliasTable.projectId, projectId),
          eq(ProjectBrainFactTable.projectId, projectId),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
          ),
          inArray(ProjectBrainAliasTable.pageId, pageIds),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .limit(1000);
    for (const row of aliasRows) {
      const page = pageById.get(row.pageId);
      if (page && !page.aliases.includes(row.alias))
        page.aliases.push(row.alias);
    }
  }

  const visiblePages = [...pageById.values()];
  const visiblePageIds = visiblePages.map((page) => page.id);
  const pairReviews = visiblePageIds.length
    ? await pgDb
        .select({
          firstPageId: ProjectBrainPagePairReviewTable.firstPageId,
          secondPageId: ProjectBrainPagePairReviewTable.secondPageId,
        })
        .from(ProjectBrainPagePairReviewTable)
        .where(
          or(
            inArray(
              ProjectBrainPagePairReviewTable.firstPageId,
              visiblePageIds,
            ),
            inArray(
              ProjectBrainPagePairReviewTable.secondPageId,
              visiblePageIds,
            ),
          ),
        )
        .limit(5000)
    : [];
  const reviewedPairs = new Set(
    pairReviews.map(({ firstPageId, secondPageId }) =>
      [firstPageId, secondPageId].sort().join(":"),
    ),
  );
  const duplicateCandidates = findBrainPageDuplicateCandidates(
    visiblePages,
  ).filter(
    (candidate) =>
      !reviewedPairs.has(
        [candidate.firstPageId, candidate.secondPageId].sort().join(":"),
      ),
  );
  const pageScope = { projectId, collectionIds, ownerIds };
  const [stalePages, restorablePages] = await Promise.all([
    listStaleProjectBrainPages(pageScope),
    listRestorableProjectBrainPages(pageScope),
  ]);

  return Response.json(
    { pages: visiblePages, duplicateCandidates, stalePages, restorablePages },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return new Response("Forbidden", { status: 403 });
    }
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048)
      return Response.json({ error: "Request too large" }, { status: 413 });
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = mergeRequestSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.survivorPageId === parsed.data.mergedPageId
  ) {
    return Response.json({ error: "Invalid page merge" }, { status: 400 });
  }

  const rate = await checkApiRateLimit({
    kind: "project-brain-page-merge",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many merge requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const result = await pgDb.transaction((tx) =>
    mergeProjectBrainPages(tx, {
      projectId,
      actorUserId: session.user.id,
      collectionIds: access.project.collectionIds,
      ownerIds,
      ...parsed.data,
    }),
  );
  if (result.status === "merged" || result.status === "already-merged") {
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  const status =
    result.status === "not-found"
      ? 404
      : result.status === "source-unavailable"
        ? 409
        : 409;
  return Response.json(
    { error: result.status },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return new Response("Forbidden", { status: 403 });
    }
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048)
      return Response.json({ error: "Request too large" }, { status: 413 });
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = pageReviewRequestSchema.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.action === "not_same" &&
      parsed.data.firstPageId === parsed.data.secondPageId)
  ) {
    return Response.json({ error: "Invalid page pair" }, { status: 400 });
  }

  const rate = await checkApiRateLimit({
    kind: "project-brain-page-pair-review",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many page reviews. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!access.project.collectionIds.length || !ownerIds.length) {
    return Response.json({ error: "Source is unavailable" }, { status: 409 });
  }
  if (parsed.data.action === "archive_stale") {
    const archived = await archiveStaleProjectBrainPage({
      projectId,
      collectionIds: access.project.collectionIds,
      ownerIds,
      pageId: parsed.data.pageId,
    });
    return archived
      ? Response.json(
          { status: "archived" },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json(
          { error: "Page is no longer eligible for archival" },
          { status: 409 },
        );
  }
  if (parsed.data.action === "restore") {
    const restored = await restoreProjectBrainPage({
      projectId,
      collectionIds: access.project.collectionIds,
      ownerIds,
      pageId: parsed.data.pageId,
    });
    return restored
      ? Response.json(
          { status: "restored" },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json(
          { error: "Page has no current accepted source fact to restore" },
          { status: 409 },
        );
  }
  const pages = await pgDb
    .select({
      id: ProjectBrainPageTable.id,
      entityType: ProjectBrainPageTable.entityType,
    })
    .from(ProjectBrainPageTable)
    .innerJoin(
      ProjectBrainFactTable,
      eq(ProjectBrainFactTable.subjectPageId, ProjectBrainPageTable.id),
    )
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, projectId),
        isNull(ProjectBrainPageTable.archivedAt),
        inArray(ProjectBrainPageTable.id, [
          parsed.data.firstPageId,
          parsed.data.secondPageId,
        ]),
        eq(ProjectBrainFactTable.projectId, projectId),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
          ProjectBrainFactTable.chatSourceId,
        ),
        eq(ProjectBrainFactTable.predicate, "entity type"),
        eq(ProjectBrainFactTable.object, ProjectBrainPageTable.entityType),
        eq(ProjectBrainFactTable.reviewStatus, "accepted"),
        inArray(CollectionItemTable.collectionId, access.project.collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(10);
  const distinctPages = new Map(pages.map((page) => [page.id, page]));
  const first = distinctPages.get(parsed.data.firstPageId);
  const second = distinctPages.get(parsed.data.secondPageId);
  if (!first || !second || first.entityType !== second.entityType) {
    return Response.json(
      { error: "Page pair is not currently reviewable" },
      { status: 409 },
    );
  }

  const [firstPageId, secondPageId] = [first.id, second.id].sort();
  await pgDb
    .insert(ProjectBrainPagePairReviewTable)
    .values({ firstPageId, secondPageId, actorUserId: session.user.id })
    .onConflictDoNothing();
  return Response.json(
    { status: "dismissed" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
