import { getSession } from "auth/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import {
  type BrainPageDedupeInput,
  type BrainPageIdentity,
  findBrainPageDuplicateCandidates,
  judgeBrainPageDuplicateCandidates,
} from "lib/projects/brain-page-duplicate-candidates";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    pairs: z
      .array(
        z
          .object({
            firstPageId: z.string().uuid(),
            secondPageId: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

type FactRow = {
  pageId: string;
  title: string;
  entityType: string;
  salience: number;
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
};

function pairKey(firstPageId: string, secondPageId: string) {
  return [firstPageId, secondPageId].sort().join(":");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) {
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
    if (raw.length > 4096)
      return Response.json({ error: "Request too large" }, { status: 413 });
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.pairs.some(
      ({ firstPageId, secondPageId }) => firstPageId === secondPageId,
    ) ||
    new Set(
      parsed.data.pairs.map(({ firstPageId, secondPageId }) =>
        pairKey(firstPageId, secondPageId),
      ),
    ).size !== parsed.data.pairs.length
  ) {
    return Response.json({ error: "Invalid candidate pairs" }, { status: 400 });
  }

  const rate = await checkApiRateLimit({
    kind: "project-brain-page-dedupe-judge",
    id: session.user.id,
    limit: 4,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many duplicate comparisons. Try again shortly." },
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
  const collectionIds = access.project.collectionIds;
  if (!collectionIds.length || !ownerIds.length) {
    return Response.json(
      { error: "No visible project sources" },
      { status: 409 },
    );
  }
  const pageIds = [
    ...new Set(
      parsed.data.pairs.flatMap(({ firstPageId, secondPageId }) => [
        firstPageId,
        secondPageId,
      ]),
    ),
  ];

  try {
    const rows = (await pgDb
      .select({
        pageId: ProjectBrainPageTable.id,
        title: ProjectBrainPageTable.title,
        entityType: ProjectBrainPageTable.entityType,
        salience: ProjectBrainPageTable.salience,
        subject: ProjectBrainFactTable.subject,
        predicate: ProjectBrainFactTable.predicate,
        object: ProjectBrainFactTable.object,
        evidence: ProjectBrainFactTable.evidence,
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
          inArray(ProjectBrainPageTable.id, pageIds),
          isNull(ProjectBrainPageTable.archivedAt),
          isNull(ProjectBrainPageTable.mergedIntoPageId),
          eq(ProjectBrainFactTable.projectId, projectId),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .orderBy(desc(ProjectBrainFactTable.createdAt))
      .limit(400)) as FactRow[];

    const byPage = new Map<
      string,
      BrainPageIdentity & {
        facts: Array<{ claim: string; evidence: string }>;
        hasTypeEvidence: boolean;
      }
    >();
    for (const row of rows) {
      const page = byPage.get(row.pageId) ?? {
        id: row.pageId,
        title: row.title,
        entityType: row.entityType,
        normalizedTitle: row.title.toLocaleLowerCase(),
        aliases: [],
        salience: row.salience,
        facts: [],
        hasTypeEvidence: false,
      };
      if (
        ["alias", "also known as"].includes(
          row.predicate.trim().toLocaleLowerCase(),
        ) &&
        !page.aliases.includes(row.object)
      ) {
        page.aliases.push(row.object);
      }
      if (
        row.predicate.trim().toLocaleLowerCase() === "entity type" &&
        row.object === page.entityType
      ) {
        page.hasTypeEvidence = true;
      }
      if (page.facts.length < 16) {
        page.facts.push({
          claim: `${row.subject} ${row.predicate} ${row.object}`.slice(0, 500),
          evidence: row.evidence.slice(0, 300),
        });
      }
      byPage.set(row.pageId, page);
    }

    const visiblePages = [...byPage.values()].filter(
      (page) => page.hasTypeEvidence,
    );
    const visiblePageIds = new Set(visiblePages.map((page) => page.id));
    if (pageIds.some((id) => !visiblePageIds.has(id))) {
      return Response.json(
        { error: "Candidate pages are no longer available in current sources" },
        { status: 409 },
      );
    }
    const candidates = findBrainPageDuplicateCandidates(visiblePages);
    const candidatePairs = new Map(
      candidates.map((candidate) => [
        pairKey(candidate.firstPageId, candidate.secondPageId),
        candidate,
      ]),
    );
    const requestedPairs = parsed.data.pairs.map((pair) =>
      candidatePairs.get(pairKey(pair.firstPageId, pair.secondPageId)),
    );
    if (requestedPairs.some((candidate) => !candidate)) {
      return Response.json(
        { error: "One or more pairs are no longer duplicate candidates" },
        { status: 409 },
      );
    }

    const dedupeInputs: BrainPageDedupeInput[] = requestedPairs.map(
      (candidate) => {
        const first = byPage.get(candidate!.firstPageId)!;
        const second = byPage.get(candidate!.secondPageId)!;
        return {
          firstPageId: first.id,
          firstTitle: first.title,
          firstType: first.entityType,
          firstAliases: first.aliases,
          firstFacts: first.facts,
          secondPageId: second.id,
          secondTitle: second.title,
          secondType: second.entityType,
          secondAliases: second.aliases,
          secondFacts: second.facts,
        };
      },
    );
    const results = await judgeBrainPageDuplicateCandidates(dedupeInputs);
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[project-brain] duplicate page judgment failed", error);
    return Response.json(
      { error: "Could not compare these pages right now" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
