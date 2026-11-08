import { getSession } from "auth/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getTeamMemberBudgetsEnabled } from "lib/ai/model-pricing.server";
import {
  TeamBudgetAuthorizationError,
  TeamBudgetExceededError,
  TeamBudgetPolicyError,
} from "lib/ai/team-member-ai-budget-core";
import {
  TeamBudgetCurrencyMismatchError,
  TeamBudgetModelUnpricedError,
} from "lib/ai/team-member-ai-budget-gate";
import {
  normalizeModelUsage,
  reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest,
} from "lib/ai/team-member-ai-budget-runtime";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainFactTable,
  ProjectBrainPageTable,
} from "lib/db/pg/schema.pg";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  getTeamRole,
  mayEditProject,
} from "lib/projects/access";
import {
  type BrainPageDedupeInput,
  type BrainPageIdentity,
  findBrainPageDuplicateCandidates,
  judgeBrainPageDuplicateCandidatesWithUsage,
} from "lib/projects/brain-page-duplicate-candidates";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { getProjectBrainStatusModel } from "lib/projects/project-brain-status";
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

  let rawBody: Uint8Array | null;
  try {
    rawBody = await readBoundedRequestBody(request, 4_096);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!rawBody)
    return Response.json({ error: "Request too large" }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(rawBody));
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

  let budgetLease: Awaited<ReturnType<typeof reserveTeamBudgetForAiRequest>>;
  let budgetModel: Awaited<ReturnType<typeof getProjectBrainStatusModel>>;
  let providerCallCompleted = false;
  let budgetSettled = false;
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
          ProjectBrainFactTable.chatSourceId,
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
    if (access.project.teamId && (await getTeamMemberBudgetsEnabled())) {
      const teamRole = await getTeamRole(
        access.project.teamId,
        session.user.id,
      );
      if (!teamRole) return new Response("Forbidden", { status: 403 });
      // Team owners are exempt. Every other team role must be covered by an
      // explicit enabled model price and a durable reservation.
      if (teamRole !== "owner") {
        budgetModel = await getProjectBrainStatusModel();
        if (!budgetModel) {
          return Response.json(
            {
              code: "team-budget-unavailable",
              message:
                "No enabled, configured model is available for this team request.",
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
        budgetLease = await reserveTeamBudgetForAiRequest({
          teamId: access.project.teamId,
          userId: session.user.id,
          model: budgetModel,
          promptCharacters: JSON.stringify(dedupeInputs).length + 1_000,
          idempotencyScope: `project-brain-page-dedupe:${projectId}:${pageIds
            .slice()
            .sort()
            .join(":")}`,
        });
        if (!budgetLease) {
          return Response.json(
            {
              code: "team-budget-unavailable",
              message: "A trusted team request could not be reserved.",
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    }
    const generated = await judgeBrainPageDuplicateCandidatesWithUsage(
      dedupeInputs,
      {
        timeoutMs: 20_000,
        ...(budgetLease ? { model: budgetModel! } : {}),
        onProviderComplete: () => {
          providerCallCompleted = true;
        },
      },
    );
    if (budgetLease) {
      const usage = normalizeModelUsage(generated.usage);
      await settleTeamBudgetForAiRequest(budgetLease, {
        usage: usage ?? undefined,
      });
      budgetSettled = true;
      if (!usage) throw new Error("Provider usage metadata was unavailable");
    }
    const results = generated.judgments;
    const currentAccess = await getProjectAccess(projectId, session.user.id);
    if (!currentAccess) return new Response("Not found", { status: 404 });
    if (!mayEditProject(currentAccess.role))
      return new Response("Forbidden", { status: 403 });
    if (currentAccess.project.teamId !== access.project.teamId) {
      return Response.json(
        { error: "Project team scope changed during duplicate comparison" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (budgetLease && !budgetSettled && !providerCallCompleted) {
      await settleTeamBudgetForAiRequest(budgetLease, { aborted: true }).catch(
        (releaseError) =>
          console.error(
            "[project-brain] duplicate-judgment budget release failed",
            releaseError,
          ),
      );
      budgetSettled = true;
    }
    if (error instanceof TeamBudgetExceededError) {
      return Response.json(
        { code: "team-member-budget-exceeded", message: error.message },
        { status: 402, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof TeamBudgetAuthorizationError)
      return new Response("Forbidden", { status: 403 });
    if (
      error instanceof TeamBudgetModelUnpricedError ||
      error instanceof TeamBudgetCurrencyMismatchError ||
      error instanceof TeamBudgetPolicyError
    ) {
      return Response.json(
        {
          code: "team-budget-unavailable",
          message: "The team AI budget could not be verified for this model.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[project-brain] duplicate page judgment failed", error);
    return Response.json(
      { error: "Could not compare these pages right now" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
