import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  or,
} from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainContradictionTable,
  ProjectBrainDreamRunTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
  ProjectBrainRunTable,
  ProjectBrainStatusSnapshotTable,
} from "lib/db/pg/schema.pg";
import { notifyProjectHealthTransition } from "lib/notifications/project-health";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import {
  findProjectBrainConflictCandidates,
  judgeProjectBrainConflictCandidates,
} from "lib/projects/brain-contradictions";
import {
  type ProjectBrainDreamStage,
  appendProjectBrainDreamWarning,
  getNextProjectBrainDreamStage,
  hasProjectBrainStatusSnapshotForFingerprint,
  makeProjectBrainDreamIdempotencyKey,
  sanitizeProjectBrainDreamError,
} from "lib/projects/brain-dream-state";
import {
  MAX_STALE_PAGE_ARCHIVES_PER_PASS,
  archiveStaleProjectBrainPage,
  listStaleProjectBrainPages,
} from "lib/projects/brain-page-archive";
import {
  findBrainPageDuplicateCandidates,
  judgeBrainPageDuplicateCandidates,
} from "lib/projects/brain-page-duplicate-candidates";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { ProjectBrainHealthSchema } from "lib/projects/project-brain-health";
import {
  generateProjectBrainStatus,
  loadProjectBrainStatusContext,
} from "lib/projects/project-brain-status";
import { recomputeProjectBrainSalience } from "lib/projects/recompute-brain-salience";

const STALE_CLAIM_MS = 5 * 60_000;
const MAX_VISIBLE_FACTS = 1000;

export async function enqueueProjectBrainDream(input: {
  projectId: string;
  userId: string;
  reason: "manual" | "nightly";
  idempotencyKey: string;
}) {
  const [created] = await pgDb
    .insert(ProjectBrainDreamRunTable)
    .values({
      projectId: input.projectId,
      requestedByUserId: input.userId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({
      target: [
        ProjectBrainDreamRunTable.projectId,
        ProjectBrainDreamRunTable.idempotencyKey,
      ],
    })
    .returning({ id: ProjectBrainDreamRunTable.id });
  if (created) return { id: created.id, created: true };
  const [existing] = await pgDb
    .select({ id: ProjectBrainDreamRunTable.id })
    .from(ProjectBrainDreamRunTable)
    .where(
      and(
        eq(ProjectBrainDreamRunTable.projectId, input.projectId),
        eq(ProjectBrainDreamRunTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return { id: existing?.id ?? null, created: false };
}

async function liveScope(run: typeof ProjectBrainDreamRunTable.$inferSelect) {
  const access = await getProjectAccess(run.projectId, run.requestedByUserId);
  if (!access || !mayEditProject(access.role))
    throw new Error("Project edit access was revoked.");
  const collectionIds = [...access.project.collectionIds];
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!collectionIds.length || !ownerIds.length)
    throw new Error("No attached project sources are currently available.");
  return {
    projectId: run.projectId,
    collectionIds,
    ownerIds,
    project: {
      id: access.project.id,
      name: access.project.name,
      goal: access.project.goal,
      description: access.project.description,
      systemPrompt: access.project.systemPrompt,
    },
  };
}

async function assertScopeUnchanged(
  run: typeof ProjectBrainDreamRunTable.$inferSelect,
  scope: Awaited<ReturnType<typeof liveScope>>,
) {
  const current = await liveScope(run);
  const same = (left: string[], right: string[]) =>
    [...left].sort().join(":") === [...right].sort().join(":");
  if (
    !same(scope.collectionIds, current.collectionIds) ||
    !same(scope.ownerIds, current.ownerIds)
  ) {
    throw new Error(
      "Attached project sources changed during this stage; the stage result was discarded.",
    );
  }
}

async function visibleFacts(scope: Awaited<ReturnType<typeof liveScope>>) {
  return pgDb
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
        eq(ProjectBrainFactTable.projectId, scope.projectId),
        eq(ProjectBrainFactTable.reviewStatus, "accepted"),
        projectBrainRunIsActiveSourceRevision(
          ProjectBrainFactTable.runId,
          ProjectBrainFactTable.projectId,
          ProjectBrainFactTable.sourceItemId,
        ),
        inArray(CollectionItemTable.collectionId, scope.collectionIds),
        inArray(CollectionTable.userId, scope.ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .orderBy(desc(ProjectBrainFactTable.createdAt))
    .limit(MAX_VISIBLE_FACTS);
}

async function runDedupeStage(
  run: typeof ProjectBrainDreamRunTable.$inferSelect,
  scope: Awaited<ReturnType<typeof liveScope>>,
) {
  const pages = await pgDb
    .select({
      id: ProjectBrainPageTable.id,
      title: ProjectBrainPageTable.title,
      entityType: ProjectBrainPageTable.entityType,
      normalizedTitle: ProjectBrainPageTable.normalizedTitle,
      salience: ProjectBrainPageTable.salience,
    })
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, scope.projectId),
        isNull(ProjectBrainPageTable.archivedAt),
      ),
    )
    .orderBy(desc(ProjectBrainPageTable.salience))
    .limit(300);
  const facts = await visibleFacts(scope);
  const identities = pages
    .filter((page) =>
      facts.some(
        (fact) =>
          fact.subjectPageId === page.id &&
          fact.predicate.trim().toLowerCase() === "entity type" &&
          fact.object === page.entityType,
      ),
    )
    .map((page) => ({
      ...page,
      aliases: facts
        .filter(
          (fact) =>
            fact.subjectPageId === page.id &&
            ["alias", "also known as"].includes(fact.predicate.toLowerCase()),
        )
        .map((fact) => fact.object),
    }));
  const candidates = findBrainPageDuplicateCandidates(identities, 20);
  let suggestions: Array<{
    firstPageId: string;
    secondPageId: string;
    firstTitle: string;
    secondTitle: string;
    verdict: string;
    explanation: string;
  }> = [];
  if (candidates.length) {
    const pageFacts = new Map<string, typeof facts>();
    for (const candidate of candidates)
      for (const id of [candidate.firstPageId, candidate.secondPageId])
        pageFacts.set(
          id,
          facts.filter((fact) => fact.subjectPageId === id),
        );
    const inputs = candidates.slice(0, 10).map((candidate) => {
      const first = identities.find(
        (page) => page.id === candidate.firstPageId,
      )!;
      const second = identities.find(
        (page) => page.id === candidate.secondPageId,
      )!;
      const toFacts = (id: string) =>
        (pageFacts.get(id) ?? []).slice(0, 8).map((fact) => ({
          claim: `${fact.subject} ${fact.predicate} ${fact.object}`,
          evidence: fact.evidence,
        }));
      return {
        firstPageId: first.id,
        firstTitle: first.title,
        firstType: first.entityType,
        firstAliases: first.aliases,
        firstFacts: toFacts(first.id),
        secondPageId: second.id,
        secondTitle: second.title,
        secondType: second.entityType,
        secondAliases: second.aliases,
        secondFacts: toFacts(second.id),
      };
    });
    const results = await judgeBrainPageDuplicateCandidates(inputs);
    suggestions = results
      .filter((result) => result.verdict === "same_entity")
      .map((result) => {
        const first = identities.find(
          (page) => page.id === result.firstPageId,
        )!;
        const second = identities.find(
          (page) => page.id === result.secondPageId,
        )!;
        return {
          ...result,
          firstTitle: first.title,
          secondTitle: second.title,
        };
      });
  }
  // A fresh access check immediately before recording stage output; model output remains advisory.
  await assertScopeUnchanged(run, scope);
  return {
    pagesScanned: pages.length,
    candidatePairs: candidates.length,
    identitySuggestions: suggestions.length,
    suggestions,
    autoMerged: 0,
  };
}

async function runContradictionStage(
  run: typeof ProjectBrainDreamRunTable.$inferSelect,
  scope: Awaited<ReturnType<typeof liveScope>>,
) {
  const facts = await visibleFacts(scope);
  const candidates = findProjectBrainConflictCandidates(facts, facts, 500);
  const existing = candidates.length
    ? await pgDb
        .select({
          factIdA: ProjectBrainContradictionTable.factIdA,
          factIdB: ProjectBrainContradictionTable.factIdB,
        })
        .from(ProjectBrainContradictionTable)
        .where(
          and(
            eq(ProjectBrainContradictionTable.projectId, scope.projectId),
            or(
              ...candidates.map(({ first, second }) =>
                and(
                  eq(ProjectBrainContradictionTable.factIdA, first.id),
                  eq(ProjectBrainContradictionTable.factIdB, second.id),
                ),
              ),
            ),
          ),
        )
        .limit(500)
    : [];
  const existingPairs = new Set(
    existing.map((item) => `${item.factIdA}:${item.factIdB}`),
  );
  const novel = candidates
    .filter(
      ({ first, second }) =>
        !existingPairs.has([first.id, second.id].sort().join(":")),
    )
    .slice(0, 40);
  const judgments = novel.length
    ? await judgeProjectBrainConflictCandidates(novel)
    : [];
  await assertScopeUnchanged(run, scope);
  if (judgments.length)
    await pgDb
      .insert(ProjectBrainContradictionTable)
      .values(
        judgments.map(({ candidate, verdict, explanation }) => ({
          projectId: scope.projectId,
          pageId: candidate.pageId,
          factIdA: candidate.first.id,
          factIdB: candidate.second.id,
          verdict,
          explanation,
          status: verdict === "contradiction" ? "open" : "classified",
        })),
      )
      .onConflictDoNothing();
  return {
    visibleFacts: facts.length,
    candidatePairs: candidates.length,
    classified: judgments.length,
    contradictions: judgments.filter((item) => item.verdict === "contradiction")
      .length,
    decisionsChanged: 0,
  };
}

async function runStatusStage(
  run: typeof ProjectBrainDreamRunTable.$inferSelect,
  scope: Awaited<ReturnType<typeof liveScope>>,
) {
  const loadCurrentContext = async () => {
    const currentScope = await liveScope(run);
    return loadProjectBrainStatusContext({
      project: currentScope.project,
      collectionIds: currentScope.collectionIds,
      ownerIds: currentScope.ownerIds,
    });
  };
  const context = await loadCurrentContext();
  if (!context) return { skipped: "no-current-accepted-evidence" };

  const [existing] = await pgDb
    .select({
      inputFingerprint: ProjectBrainStatusSnapshotTable.inputFingerprint,
      health: ProjectBrainStatusSnapshotTable.health,
    })
    .from(ProjectBrainStatusSnapshotTable)
    .where(
      and(
        eq(ProjectBrainStatusSnapshotTable.projectId, scope.projectId),
        eq(
          ProjectBrainStatusSnapshotTable.inputFingerprint,
          context.inputFingerprint,
        ),
      ),
    )
    .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
    .limit(1);
  if (
    hasProjectBrainStatusSnapshotForFingerprint(
      existing?.inputFingerprint,
      context.inputFingerprint,
    )
  ) {
    return { reusedSnapshot: true, health: existing.health };
  }

  const generated = await generateProjectBrainStatus(context.input);
  await assertScopeUnchanged(run, scope);
  const latestContext = await loadCurrentContext();
  if (
    !latestContext ||
    latestContext.inputFingerprint !== context.inputFingerprint
  )
    throw new Error("Project evidence changed during status synthesis.");

  const [previousSnapshot] = await pgDb
    .select({ health: ProjectBrainStatusSnapshotTable.health })
    .from(ProjectBrainStatusSnapshotTable)
    .where(eq(ProjectBrainStatusSnapshotTable.projectId, scope.projectId))
    .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
    .limit(1);
  const previousHealth = ProjectBrainHealthSchema.safeParse(
    previousSnapshot?.health,
  );
  const [snapshot] = await pgDb
    .insert(ProjectBrainStatusSnapshotTable)
    .values({
      projectId: scope.projectId,
      generatedByUserId: run.requestedByUserId,
      inputFingerprint: context.inputFingerprint,
      sourceRefs: context.sourceRefs,
      health: generated.health,
      progressPct: generated.progressPct ?? null,
      summary: generated.summary,
      blockers: generated.blockers,
    })
    .returning({ id: ProjectBrainStatusSnapshotTable.id });
  if (!snapshot) throw new Error("Project status snapshot was not persisted.");
  await notifyProjectHealthTransition({
    projectId: scope.projectId,
    inputFingerprint: context.inputFingerprint,
    previousHealth: previousHealth.success ? previousHealth.data : null,
    health: generated.health,
  });
  return { generated: true, health: generated.health };
}

export async function processProjectBrainDreamQueue(now = new Date()) {
  const [run] = await pgDb
    .select()
    .from(ProjectBrainDreamRunTable)
    .where(
      or(
        eq(ProjectBrainDreamRunTable.status, "queued"),
        and(
          eq(ProjectBrainDreamRunTable.status, "running"),
          lt(
            ProjectBrainDreamRunTable.updatedAt,
            new Date(now.getTime() - STALE_CLAIM_MS),
          ),
        ),
      ),
    )
    .orderBy(asc(ProjectBrainDreamRunTable.createdAt))
    .limit(1);
  if (!run) return { claimed: 0, completed: 0, failed: 0 };
  const [claimed] = await pgDb
    .update(ProjectBrainDreamRunTable)
    .set({
      status: "running",
      attempts: run.attempts + 1,
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    })
    .where(
      and(
        eq(ProjectBrainDreamRunTable.id, run.id),
        or(
          eq(ProjectBrainDreamRunTable.status, "queued"),
          lt(
            ProjectBrainDreamRunTable.updatedAt,
            new Date(now.getTime() - STALE_CLAIM_MS),
          ),
        ),
      ),
    )
    .returning();
  if (!claimed) return { claimed: 0, completed: 0, failed: 0 };
  const stage = claimed.stage as ProjectBrainDreamStage;
  if (stage === "done") return { claimed: 1, completed: 1, failed: 0 };
  try {
    const scope = await liveScope(claimed);
    let metrics: Record<string, unknown>;
    if (stage === "dedupe") metrics = await runDedupeStage(claimed, scope);
    else if (stage === "contradictions")
      metrics = await runContradictionStage(claimed, scope);
    else if (stage === "salience") {
      await assertScopeUnchanged(claimed, scope);
      metrics = await recomputeProjectBrainSalience(scope);
      await assertScopeUnchanged(claimed, scope);
    } else if (stage === "status") {
      metrics = await runStatusStage(claimed, scope);
    } else {
      const stale = await listStaleProjectBrainPages(scope);
      let archived = 0;
      for (const page of stale.slice(0, MAX_STALE_PAGE_ARCHIVES_PER_PASS)) {
        await assertScopeUnchanged(claimed, scope);
        if (await archiveStaleProjectBrainPage({ ...scope, pageId: page.id }))
          archived += 1;
      }
      metrics = {
        stalePagesFound: stale.length,
        stalePagesArchived: archived,
        cap: MAX_STALE_PAGE_ARCHIVES_PER_PASS,
      };
    }
    const nextStage = getNextProjectBrainDreamStage(stage);
    const nextMetrics = { ...(claimed.metrics ?? {}), [stage]: metrics };
    const done = nextStage === "done";
    const [updated] = await pgDb
      .update(ProjectBrainDreamRunTable)
      .set({
        stage: nextStage,
        status: done ? "succeeded" : "queued",
        metrics: nextMetrics,
        updatedAt: now,
        ...(done ? { finishedAt: now } : {}),
      })
      .where(eq(ProjectBrainDreamRunTable.id, claimed.id))
      .returning({ id: ProjectBrainDreamRunTable.id });
    return {
      claimed: 1,
      completed: done && Boolean(updated) ? 1 : 0,
      failed: 0,
    };
  } catch (error) {
    const message = sanitizeProjectBrainDreamError(error);
    const warnings = appendProjectBrainDreamWarning(
      claimed.warnings ?? [],
      stage,
      message,
    );
    const nextStage = getNextProjectBrainDreamStage(stage);
    const done = nextStage === "done";
    await pgDb
      .update(ProjectBrainDreamRunTable)
      .set({
        stage: nextStage,
        status: done ? "partial" : "queued",
        warnings,
        errorMessage: message.slice(0, 1000),
        updatedAt: now,
        ...(done ? { finishedAt: now } : {}),
      })
      .where(eq(ProjectBrainDreamRunTable.id, claimed.id));
    return { claimed: 1, completed: done ? 1 : 0, failed: 0 };
  }
}

/** Enqueue once per UTC day only for projects with source analysis in the last day. */
export async function enqueueNightlyProjectBrainDreams(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  const dailyKey = makeProjectBrainDreamIdempotencyKey("nightly", now);
  const recent = await pgDb
    .selectDistinctOn([ProjectBrainFactTable.projectId], {
      projectId: ProjectBrainFactTable.projectId,
      userId: ProjectBrainRunTable.requestedByUserId,
    })
    .from(ProjectBrainFactTable)
    .innerJoin(
      ProjectBrainRunTable,
      eq(ProjectBrainRunTable.id, ProjectBrainFactTable.runId),
    )
    .where(
      and(
        eq(ProjectBrainRunTable.status, "succeeded"),
        gt(ProjectBrainRunTable.updatedAt, since),
        notExists(
          pgDb
            .select({ id: ProjectBrainDreamRunTable.id })
            .from(ProjectBrainDreamRunTable)
            .where(
              and(
                eq(
                  ProjectBrainDreamRunTable.projectId,
                  ProjectBrainFactTable.projectId,
                ),
                eq(ProjectBrainDreamRunTable.idempotencyKey, dailyKey),
              ),
            ),
        ),
      ),
    )
    .orderBy(
      ProjectBrainFactTable.projectId,
      desc(ProjectBrainRunTable.updatedAt),
    )
    .limit(100);
  let queued = 0;
  for (const item of recent) {
    const access = await getProjectAccess(item.projectId, item.userId);
    if (!access || !mayEditProject(access.role)) continue;
    const result = await enqueueProjectBrainDream({
      projectId: item.projectId,
      userId: item.userId,
      reason: "nightly",
      idempotencyKey: dailyKey,
    });
    if (result.created) queued += 1;
  }
  return { queued };
}
