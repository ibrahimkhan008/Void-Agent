import { getSession } from "auth/server";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainContradictionTable,
  ProjectBrainFactTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import {
  type ProjectBrainClaim,
  findProjectBrainConflictCandidates,
  judgeProjectBrainConflictCandidates,
} from "lib/projects/brain-contradictions";
import { getProjectFactConflictResolution } from "lib/projects/brain-graph";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Classify new current-revision cross-source conflicts without resolving them. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-contradiction-scan",
    id: session.user.id,
    limit: 2,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many conflict scans. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );

  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length)
    return Response.json(
      {
        scanned: 0,
        classified: 0,
        contradictions: 0,
        compatible: 0,
        unknown: 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );

  try {
    const rows = await pgDb
      .select({
        id: ProjectBrainFactTable.id,
        sourceItemId: ProjectBrainFactTable.sourceItemId,
        subjectPageId: ProjectBrainFactTable.subjectPageId,
        subject: ProjectBrainFactTable.subject,
        predicate: ProjectBrainFactTable.predicate,
        object: ProjectBrainFactTable.object,
        evidence: ProjectBrainFactTable.evidence,
      })
      .from(ProjectBrainFactTable)
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
          eq(ProjectBrainFactTable.projectId, projectId),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ),
          eq(ProjectBrainFactTable.reviewStatus, "accepted"),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .orderBy(desc(ProjectBrainFactTable.createdAt))
      .limit(1000);
    const visibleFacts: ProjectBrainClaim[] = rows;
    const allCandidates = findProjectBrainConflictCandidates(
      visibleFacts,
      visibleFacts,
      500,
    );
    const existingRows = allCandidates.length
      ? await pgDb
          .select({
            factIdA: ProjectBrainContradictionTable.factIdA,
            factIdB: ProjectBrainContradictionTable.factIdB,
          })
          .from(ProjectBrainContradictionTable)
          .where(
            and(
              eq(ProjectBrainContradictionTable.projectId, projectId),
              or(
                ...allCandidates.map(({ first, second }) =>
                  and(
                    eq(ProjectBrainContradictionTable.factIdA, first.id),
                    eq(ProjectBrainContradictionTable.factIdB, second.id),
                  ),
                ),
              ),
            ),
          )
          .limit(allCandidates.length)
      : [];
    const existingPairs = new Set(
      existingRows.map(({ factIdA, factIdB }) => `${factIdA}:${factIdB}`),
    );
    const candidates = allCandidates
      .filter(
        ({ first, second }) =>
          !existingPairs.has([first.id, second.id].sort().join(":")),
      )
      .slice(0, 40);
    const judgments = candidates.length
      ? await judgeProjectBrainConflictCandidates(candidates)
      : [];
    const newDecisions = judgments.map(
      ({ candidate, verdict, explanation }) => ({
        projectId,
        pageId: candidate.pageId,
        factIdA: candidate.first.id,
        factIdB: candidate.second.id,
        verdict,
        explanation,
        status: verdict === "contradiction" ? "open" : "classified",
      }),
    );
    if (newDecisions.length) {
      await pgDb
        .insert(ProjectBrainContradictionTable)
        .values(newDecisions)
        .onConflictDoNothing();
    }
    return Response.json(
      {
        scanned: candidates.length,
        classified: judgments.length,
        contradictions: judgments.filter(
          ({ verdict }) => verdict === "contradiction",
        ).length,
        compatible: judgments.filter(({ verdict }) => verdict === "compatible")
          .length,
        unknown: judgments.filter(({ verdict }) => verdict === "unknown")
          .length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[project-brain] contradiction scan failed", error);
    return Response.json(
      { error: "Could not classify project conflicts right now" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Closed contradiction decisions remain inspectable after a source revision changes. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const historical =
    new URL(request.url).searchParams.get("history") === "true";
  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length) {
    return Response.json(
      historical ? { history: [] } : { contradictions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const decisions = await pgDb
    .select({
      id: ProjectBrainContradictionTable.id,
      factIdA: ProjectBrainContradictionTable.factIdA,
      factIdB: ProjectBrainContradictionTable.factIdB,
      verdict: ProjectBrainContradictionTable.verdict,
      explanation: ProjectBrainContradictionTable.explanation,
      status: ProjectBrainContradictionTable.status,
      keptFactId: ProjectBrainContradictionTable.keptFactId,
      updatedAt: ProjectBrainContradictionTable.updatedAt,
    })
    .from(ProjectBrainContradictionTable)
    .where(
      and(
        eq(ProjectBrainContradictionTable.projectId, projectId),
        historical
          ? ne(ProjectBrainContradictionTable.status, "open")
          : and(
              eq(ProjectBrainContradictionTable.status, "open"),
              eq(ProjectBrainContradictionTable.verdict, "contradiction"),
            ),
      ),
    )
    .orderBy(desc(ProjectBrainContradictionTable.updatedAt))
    .limit(100);

  const factIds = [
    ...new Set(
      decisions.flatMap((decision) => [decision.factIdA, decision.factIdB]),
    ),
  ];
  if (!factIds.length) {
    return Response.json(
      historical ? { history: [] } : { contradictions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const facts = await pgDb
    .select({
      id: ProjectBrainFactTable.id,
      sourceItemId: ProjectBrainFactTable.sourceItemId,
      sourceVersionId: ProjectBrainFactTable.sourceVersionId,
      subject: ProjectBrainFactTable.subject,
      predicate: ProjectBrainFactTable.predicate,
      object: ProjectBrainFactTable.object,
      evidence: ProjectBrainFactTable.evidence,
      reviewStatus: ProjectBrainFactTable.reviewStatus,
      filename: CollectionItemTable.filename,
      sourceVersionCreatedAt: ProjectBrainSourceVersionTable.createdAt,
    })
    .from(ProjectBrainFactTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .innerJoin(
      ProjectBrainSourceVersionTable,
      and(
        eq(
          ProjectBrainSourceVersionTable.id,
          ProjectBrainFactTable.sourceVersionId,
        ),
        eq(
          ProjectBrainSourceVersionTable.projectId,
          ProjectBrainFactTable.projectId,
        ),
        eq(
          ProjectBrainSourceVersionTable.sourceItemId,
          ProjectBrainFactTable.sourceItemId,
        ),
      ),
    )
    .where(
      and(
        eq(ProjectBrainFactTable.projectId, projectId),
        historical
          ? undefined
          : projectBrainRunIsActiveSourceRevision(
              ProjectBrainFactTable.runId,
              ProjectBrainFactTable.projectId,
              ProjectBrainFactTable.sourceItemId,
            ),
        inArray(ProjectBrainFactTable.id, factIds),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    );
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const history = decisions.flatMap((decision) => {
    const first = factById.get(decision.factIdA);
    const second = factById.get(decision.factIdB);
    return first && second ? [{ ...decision, first, second }] : [];
  });
  return Response.json(historical ? { history } : { contradictions: history }, {
    headers: { "cache-control": "no-store" },
  });
}

const resolutionSchema = z
  .object({
    firstFactId: z.string().uuid(),
    secondFactId: z.string().uuid(),
    keepFactId: z.string().uuid().optional(),
    action: z.enum(["keep", "dismiss"]).default("keep"),
  })
  .refine((value) => value.action === "dismiss" || Boolean(value.keepFactId));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  const collectionIds = access.project.collectionIds;
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length) {
    return Response.json(
      { error: "Facts not found or source access changed" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = resolutionSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.firstFactId === parsed.data.secondFactId ||
    (parsed.data.action === "keep" &&
      ![parsed.data.firstFactId, parsed.data.secondFactId].includes(
        parsed.data.keepFactId ?? "",
      ))
  ) {
    return Response.json(
      { error: "Invalid contradiction resolution" },
      { status: 400 },
    );
  }

  const response = await pgDb.transaction(async (tx) => {
    const rows = await tx
      .select({ fact: ProjectBrainFactTable })
      .from(ProjectBrainFactTable)
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
          eq(ProjectBrainFactTable.projectId, projectId),
          projectBrainRunIsActiveSourceRevision(
            ProjectBrainFactTable.runId,
            ProjectBrainFactTable.projectId,
            ProjectBrainFactTable.sourceItemId,
          ),
          inArray(ProjectBrainFactTable.id, [
            parsed.data.firstFactId,
            parsed.data.secondFactId,
          ]),
          inArray(CollectionItemTable.collectionId, collectionIds),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
          ne(ProjectBrainFactTable.reviewStatus, "rejected"),
        ),
      )
      .for("update");
    const pair = rows.map(({ fact }) => fact);
    if (pair.length !== 2)
      return {
        error: "Facts not found or already resolved",
        status: 404 as const,
      };
    const [first, second] = pair;
    const resolution =
      first && second
        ? getProjectFactConflictResolution(
            first,
            second,
            parsed.data.keepFactId ?? first.id,
          )
        : null;
    if (!resolution) {
      return {
        error: "Facts do not form a potential conflict",
        status: 409 as const,
      };
    }
    if (parsed.data.action === "dismiss") {
      const [factIdA, factIdB] = [first.id, second.id].sort();
      await tx
        .insert(ProjectBrainContradictionTable)
        .values({
          projectId,
          pageId: first.subjectPageId ?? second.subjectPageId ?? null,
          factIdA,
          factIdB,
          verdict: "potential",
          status: "dismissed",
          resolvedByUserId: session.user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            ProjectBrainContradictionTable.factIdA,
            ProjectBrainContradictionTable.factIdB,
          ],
          set: {
            status: "dismissed",
            resolvedByUserId: session.user.id,
            keptFactId: null,
            updatedAt: new Date(),
          },
        });
      return { dismissed: true };
    }
    if (!parsed.data.keepFactId) {
      return { error: "Select a claim to keep", status: 400 as const };
    }
    await tx
      .update(ProjectBrainFactTable)
      .set({ reviewStatus: "accepted", reviewedAt: new Date() })
      .where(
        and(
          eq(ProjectBrainFactTable.projectId, projectId),
          eq(ProjectBrainFactTable.id, resolution.keepId),
        ),
      );
    await tx
      .update(ProjectBrainFactTable)
      .set({ reviewStatus: "rejected", reviewedAt: new Date() })
      .where(
        and(
          eq(ProjectBrainFactTable.projectId, projectId),
          eq(ProjectBrainFactTable.id, resolution.rejectId),
        ),
      );
    const [factIdA, factIdB] = [
      parsed.data.firstFactId,
      parsed.data.secondFactId,
    ].sort();
    await tx
      .insert(ProjectBrainContradictionTable)
      .values({
        projectId,
        pageId: first.subjectPageId ?? second.subjectPageId ?? null,
        factIdA,
        factIdB,
        verdict: "potential",
        status: "resolved",
        resolvedByUserId: session.user.id,
        keptFactId: resolution.keepId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          ProjectBrainContradictionTable.factIdA,
          ProjectBrainContradictionTable.factIdB,
        ],
        set: {
          status: "resolved",
          resolvedByUserId: session.user.id,
          keptFactId: resolution.keepId,
          updatedAt: new Date(),
        },
      });
    return {
      keptFactId: resolution.keepId,
      rejectedFactId: resolution.rejectId,
    };
  });
  if ("error" in response)
    return Response.json(
      { error: response.error },
      { status: response.status },
    );
  return Response.json(response);
}
