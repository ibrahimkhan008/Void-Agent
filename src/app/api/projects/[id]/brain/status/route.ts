import { getSession } from "auth/server";
import { and, desc, eq } from "drizzle-orm";
import { getTeamMemberBudgetsEnabled } from "lib/ai/model-pricing.server";
import {
  TeamBudgetAuthorizationError,
  TeamBudgetExceededError,
  TeamBudgetPolicyError,
} from "lib/ai/team-member-ai-budget";
import {
  TeamBudgetCurrencyMismatchError,
  TeamBudgetModelUnpricedError,
} from "lib/ai/team-member-ai-budget-gate";
import {
  type TeamBudgetLease,
  normalizeModelUsage,
  reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest,
} from "lib/ai/team-member-ai-budget-runtime";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainStatusSnapshotTable } from "lib/db/pg/schema.pg";
import { notifyProjectHealthTransition } from "lib/notifications/project-health";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { ProjectBrainHealthSchema } from "lib/projects/project-brain-health";
import {
  generateProjectBrainStatusWithUsage,
  getProjectBrainStatusModel,
  loadProjectBrainStatusContext,
} from "lib/projects/project-brain-status";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ProjectAccess = NonNullable<Awaited<ReturnType<typeof getProjectAccess>>>;
type ProjectAccessResult =
  | { ok: true; access: ProjectAccess }
  | { ok: false; response: Response };

async function getCurrentAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccessResult> {
  const access = await getProjectAccess(projectId, userId);
  if (!access)
    return { ok: false, response: new Response("Not found", { status: 404 }) };
  return { ok: true, access };
}

async function getCurrentContext(access: ProjectAccess) {
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const context = await loadProjectBrainStatusContext({
    project: access.project,
    collectionIds: access.project.collectionIds,
    ownerIds,
  });
  return { context };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId } = await params;
  try {
    const current = await getCurrentAccess(projectId, session.user.id);
    if (!current.ok) return current.response;
    const { context } = await getCurrentContext(current.access);
    if (!context)
      return Response.json(
        { snapshot: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    const [snapshot] = await pgDb
      .select({
        id: ProjectBrainStatusSnapshotTable.id,
        health: ProjectBrainStatusSnapshotTable.health,
        progressPct: ProjectBrainStatusSnapshotTable.progressPct,
        summary: ProjectBrainStatusSnapshotTable.summary,
        blockers: ProjectBrainStatusSnapshotTable.blockers,
        createdAt: ProjectBrainStatusSnapshotTable.createdAt,
      })
      .from(ProjectBrainStatusSnapshotTable)
      .where(andProjectFingerprint(projectId, context.inputFingerprint))
      .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
      .limit(1);
    return Response.json(
      { snapshot: snapshot ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[project-brain] status read failed", error);
    return Response.json(
      { error: "Could not load project status" },
      { status: 500 },
    );
  }
}

function andProjectFingerprint(projectId: string, fingerprint: string) {
  return and(
    eq(ProjectBrainStatusSnapshotTable.projectId, projectId),
    eq(ProjectBrainStatusSnapshotTable.inputFingerprint, fingerprint),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let budgetLease: TeamBudgetLease | undefined;
  let budgetSettled = false;
  let providerCallCompleted = false;
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
  const current = await getCurrentAccess(projectId, session.user.id);
  if (!current.ok) return current.response;
  if (!mayEditProject(current.access.role))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-status",
    id: session.user.id,
    limit: 2,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many project status refreshes. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  const { context } = await getCurrentContext(current.access);
  if (!context)
    return Response.json(
      {
        error:
          "No current accepted project knowledge is available to summarize",
      },
      { status: 422 },
    );

  try {
    const [cachedSnapshot] = await pgDb
      .select({
        id: ProjectBrainStatusSnapshotTable.id,
        health: ProjectBrainStatusSnapshotTable.health,
        progressPct: ProjectBrainStatusSnapshotTable.progressPct,
        summary: ProjectBrainStatusSnapshotTable.summary,
        blockers: ProjectBrainStatusSnapshotTable.blockers,
        createdAt: ProjectBrainStatusSnapshotTable.createdAt,
      })
      .from(ProjectBrainStatusSnapshotTable)
      .where(andProjectFingerprint(projectId, context.inputFingerprint))
      .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
      .limit(1);
    if (cachedSnapshot) {
      return Response.json(
        { snapshot: cachedSnapshot },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // The project access record is the only team-billing authority. Model
    // choice likewise comes from enabled admin configuration, never request data.
    const teamId = current.access.project.teamId;
    const budgetsEnabled = await getTeamMemberBudgetsEnabled();
    const billableTeamRun = Boolean(teamId && budgetsEnabled);
    const model = billableTeamRun ? await getProjectBrainStatusModel() : null;
    if (billableTeamRun && !model) {
      return Response.json(
        {
          code: "team-budget-unavailable",
          message:
            "No enabled, configured model is available for this team request.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (billableTeamRun && model) {
      budgetLease = await reserveTeamBudgetForAiRequest({
        teamId,
        userId: session.user.id,
        model,
        promptCharacters: JSON.stringify(context.input).length + 2_000,
        idempotencyScope: `project-brain-status:${projectId}:${context.inputFingerprint}`,
      });
      if (!budgetLease) {
        throw new TeamBudgetPolicyError(
          "A trusted team request could not obtain a budget reservation.",
        );
      }
    }

    const generated = await generateProjectBrainStatusWithUsage(
      context.input,
      25_000,
      {
        model: budgetLease ? model! : undefined,
        signal: request.signal,
      },
    );
    // Once inference succeeds, a later ledger failure must not release the
    // reservation: doing so would let retries consume unbilled provider work.
    providerCallCompleted = true;
    const status = generated.status;
    if (budgetLease) {
      const usage = normalizeModelUsage(generated.usage);
      if (!usage) {
        // The provider did execute successfully. Missing usage metadata falls
        // back to the conservative reservation estimate; never release a
        // potentially billable call solely because accounting metadata is absent.
        await settleTeamBudgetForAiRequest(budgetLease, { usage: undefined });
        budgetSettled = true;
        budgetLease = undefined;
        throw new Error(
          "Provider did not return token usage for budget settlement",
        );
      }
      await settleTeamBudgetForAiRequest(budgetLease, { usage });
      budgetSettled = true;
      budgetLease = undefined;
    }

    // Access, team association, and source revisions may change during model
    // inference. Revalidate before exposing or persisting the generated data.
    const latestAccess = await getCurrentAccess(projectId, session.user.id);
    if (!latestAccess.ok) return latestAccess.response;
    if (!mayEditProject(latestAccess.access.role))
      return new Response("Forbidden", { status: 403 });
    if (latestAccess.access.project.teamId !== current.access.project.teamId) {
      return Response.json(
        { error: "Project team scope changed during status generation" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const latestContext = await getCurrentContext(latestAccess.access);
    if (
      !latestContext.context ||
      latestContext.context.inputFingerprint !== context.inputFingerprint
    ) {
      return Response.json(
        { error: "Project evidence changed during status generation" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const [previousSnapshot] = await pgDb
      .select({ health: ProjectBrainStatusSnapshotTable.health })
      .from(ProjectBrainStatusSnapshotTable)
      .where(eq(ProjectBrainStatusSnapshotTable.projectId, projectId))
      .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
      .limit(1);
    const previousHealth = ProjectBrainHealthSchema.safeParse(
      previousSnapshot?.health,
    );
    const [snapshot] = await pgDb
      .insert(ProjectBrainStatusSnapshotTable)
      .values({
        projectId,
        generatedByUserId: session.user.id,
        inputFingerprint: context.inputFingerprint,
        sourceRefs: context.sourceRefs,
        health: status.health,
        progressPct: status.progressPct ?? null,
        summary: status.summary,
        blockers: status.blockers,
      })
      .returning({
        id: ProjectBrainStatusSnapshotTable.id,
        health: ProjectBrainStatusSnapshotTable.health,
        progressPct: ProjectBrainStatusSnapshotTable.progressPct,
        summary: ProjectBrainStatusSnapshotTable.summary,
        blockers: ProjectBrainStatusSnapshotTable.blockers,
        createdAt: ProjectBrainStatusSnapshotTable.createdAt,
      });
    if (!snapshot) throw new Error("Status snapshot was not persisted");
    await notifyProjectHealthTransition({
      projectId,
      inputFingerprint: context.inputFingerprint,
      previousHealth: previousHealth.success ? previousHealth.data : null,
      health: status.health,
    });
    return Response.json(
      { snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (budgetLease && !budgetSettled && !providerCallCompleted) {
      await settleTeamBudgetForAiRequest(budgetLease, { aborted: true }).catch(
        (releaseError) =>
          console.error(
            "[project-brain] budget reservation release failed",
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
    if (error instanceof TeamBudgetAuthorizationError) {
      return new Response("Forbidden", { status: 403 });
    }
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
    console.error("[project-brain] status generation failed", error);
    return Response.json(
      { error: "Could not generate a project status summary" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
