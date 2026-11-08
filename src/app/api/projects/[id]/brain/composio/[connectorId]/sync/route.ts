import { createHash, randomUUID } from "node:crypto";
import { getSession } from "auth/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  executeComposioReadAction,
  isReadOnlyComposioAction,
  listComposioAccountsForUser,
  listComposioReadActions,
} from "lib/ai/composio";
import {
  TeamBudgetAuthorizationError,
  TeamBudgetExceededError,
  TeamBudgetPolicyError,
} from "lib/ai/team-member-ai-budget";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  ProjectBrainComposioConnectorTable,
  ProjectBrainComposioSyncRunTable,
  ProjectBrainComposioSyncSourceTable,
  ProjectBrainRunTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import { gatherComposioProjectSource } from "lib/projects/composio-gather";
import {
  boundedComposioTextResult,
  validateJsonSchemaArguments,
} from "lib/projects/mcp-sync";
import { ensureProjectBrainSourceVersion } from "lib/projects/source-versions";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_SOURCE_CHARS = 60_000;
const syncSchema = z
  .object({
    mode: z.enum(["manual", "gather"]).default("manual"),
    calls: z
      .array(
        z
          .object({
            actionSlug: z.string().min(1).max(160),
            arguments: z.record(z.string(), z.unknown()).default({}),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .optional(),
  })
  .strict()
  .refine((value) =>
    value.mode === "gather" ? value.calls === undefined : !!value.calls,
  );

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function collectionScope(userId: string, teamId: string | null) {
  const personal = and(
    isNull(CollectionTable.orgId),
    eq(CollectionTable.userId, userId),
  );
  return teamId ? or(eq(CollectionTable.orgId, teamId), personal) : personal;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; connectorId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id: projectId, connectorId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  if (!sameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-composio-sync",
    id: session.user.id,
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed)
    return new Response("Rate limit exceeded", { status: 429 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length > 128 ||
    !/^[\x21-\x7e]+$/.test(idempotencyKey)
  ) {
    return Response.json(
      { error: "A valid Idempotency-Key header is required" },
      { status: 400 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "Invalid sync request" }, { status: 400 });

  const [connector] = await pgDb
    .select()
    .from(ProjectBrainComposioConnectorTable)
    .where(
      and(
        eq(ProjectBrainComposioConnectorTable.id, connectorId),
        eq(ProjectBrainComposioConnectorTable.projectId, projectId),
        eq(ProjectBrainComposioConnectorTable.status, "active"),
      ),
    );
  if (
    !connector ||
    !access.project.collectionIds.includes(connector.collectionId)
  )
    return new Response("Not found", { status: 404 });
  if (connector.credentialOwnerUserId !== session.user.id)
    return new Response("Forbidden", { status: 403 });
  if (
    !(await getProjectCollectionOwnerIds(access)).includes(
      connector.credentialOwnerUserId,
    )
  )
    return new Response("Not found", { status: 404 });
  const [collection] = await pgDb
    .select({ id: CollectionTable.id })
    .from(CollectionTable)
    .where(
      and(
        eq(CollectionTable.id, connector.collectionId),
        inArray(CollectionTable.id, access.project.collectionIds),
        collectionScope(connector.credentialOwnerUserId, access.project.teamId),
      ),
    );
  if (!collection)
    return new Response("Connector collection is unavailable", { status: 409 });

  const [createdRun] = await pgDb
    .insert(ProjectBrainComposioSyncRunTable)
    .values({
      connectorId,
      requestedByUserId: session.user.id,
      idempotencyKey,
      status: "running",
    })
    .onConflictDoNothing({
      target: [
        ProjectBrainComposioSyncRunTable.connectorId,
        ProjectBrainComposioSyncRunTable.idempotencyKey,
      ],
    })
    .returning();
  if (!createdRun) {
    const [existing] = await pgDb
      .select({
        id: ProjectBrainComposioSyncRunTable.id,
        status: ProjectBrainComposioSyncRunTable.status,
        sourceItemId: ProjectBrainComposioSyncRunTable.sourceItemId,
      })
      .from(ProjectBrainComposioSyncRunTable)
      .where(
        and(
          eq(ProjectBrainComposioSyncRunTable.connectorId, connectorId),
          eq(ProjectBrainComposioSyncRunTable.idempotencyKey, idempotencyKey),
          eq(
            ProjectBrainComposioSyncRunTable.requestedByUserId,
            session.user.id,
          ),
        ),
      );
    if (!existing) return new Response("Not found", { status: 404 });
    return Response.json(
      { run: existing },
      { status: existing.status === "completed" ? 200 : 202 },
    );
  }

  try {
    const account = (
      await listComposioAccountsForUser(session.user.id, {
        includeShared: true,
      })
    ).find(
      (item) =>
        item.id === connector.connectedAccountId &&
        item.status === "ACTIVE" &&
        !item.isDisabled &&
        item.toolkit?.slug?.toLowerCase() === connector.toolkitSlug,
    );
    if (!account) throw new Error("Connected account is no longer active");
    const catalog = await listComposioReadActions(connector.toolkitSlug);
    let sourceText: string;
    if (parsed.data.mode === "gather") {
      const currentAccess = await getProjectAccess(projectId, session.user.id);
      if (
        !currentAccess ||
        !mayEditProject(currentAccess.role) ||
        !currentAccess.project.collectionIds.includes(connector.collectionId)
      ) {
        throw new TeamBudgetAuthorizationError();
      }
      const currentOwnerIds = await getProjectCollectionOwnerIds(currentAccess);
      if (!currentOwnerIds.includes(connector.credentialOwnerUserId)) {
        throw new TeamBudgetAuthorizationError();
      }
      sourceText = await gatherComposioProjectSource({
        userId: session.user.id,
        teamId: currentAccess.project.teamId,
        role: currentAccess.role,
        idempotencyScope: `project-brain-composio-gather:${createdRun.id}`,
        connectedAccountId: account.id,
        allowedActionSlugs: connector.readActionSlugs,
        catalog,
        project: currentAccess.project,
      });
    } else {
      const results: string[] = [];
      for (const call of parsed.data.calls ?? []) {
        if (!connector.readActionSlugs.includes(call.actionSlug))
          throw new Error("Action is not approved for this project connector");
        const action = catalog.find((tool) => tool.slug === call.actionSlug);
        if (
          !action ||
          !isReadOnlyComposioAction(action.slug) ||
          !validateJsonSchemaArguments(action.inputParameters, call.arguments)
        ) {
          throw new Error(
            "Action permissions or arguments changed; reconnect the project source",
          );
        }
        const raw = await executeComposioReadAction({
          userId: session.user.id,
          connectedAccountId: account.id,
          tool: action,
          arguments: call.arguments,
        });
        const text = boundedComposioTextResult(raw, MAX_SOURCE_CHARS);
        if (text) results.push(`## ${action.slug}\n${text}`);
      }
      sourceText = results.join("\n\n").slice(0, MAX_SOURCE_CHARS).trim();
    }
    if (!sourceText)
      throw new Error("The selected read actions returned no usable data");

    const previous = await pgDb
      .select({
        itemId: ProjectBrainComposioSyncSourceTable.sourceItemId,
        content: DocumentTable.content,
      })
      .from(ProjectBrainComposioSyncSourceTable)
      .innerJoin(
        DocumentTable,
        eq(
          DocumentTable.collectionItemId,
          ProjectBrainComposioSyncSourceTable.sourceItemId,
        ),
      )
      .where(eq(ProjectBrainComposioSyncSourceTable.connectorId, connectorId))
      .limit(25);
    const duplicate = previous.find((row) => row.content === sourceText);
    if (duplicate) {
      await pgDb
        .update(ProjectBrainComposioSyncRunTable)
        .set({
          status: "completed",
          sourceItemId: duplicate.itemId,
          updatedAt: new Date(),
        })
        .where(eq(ProjectBrainComposioSyncRunTable.id, createdRun.id));
      await pgDb
        .update(ProjectBrainComposioConnectorTable)
        .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(ProjectBrainComposioConnectorTable.id, connectorId));
      return Response.json(
        {
          run: {
            id: createdRun.id,
            status: "completed",
            sourceItemId: duplicate.itemId,
            reused: true,
          },
        },
        { status: 200 },
      );
    }

    const sourceItemId = randomUUID();
    const fingerprint = projectBrainSourceFingerprint(sourceItemId, sourceText);
    const contentFingerprint = createHash("sha256")
      .update(connector.collectionId)
      .update("\0")
      .update(sourceText)
      .digest("hex");
    const persisted = await pgDb.transaction(async (tx) => {
      await tx.insert(CollectionItemTable).values({
        id: sourceItemId,
        collectionId: connector.collectionId,
        sourceType: "composio-sync",
        filename: `${connector.displayName} Composio sync`,
        mediaType: "application/json",
        status: "ready",
      });
      await tx
        .insert(DocumentTable)
        .values({ collectionItemId: sourceItemId, content: sourceText });
      const [sourceLink] = await tx
        .insert(ProjectBrainComposioSyncSourceTable)
        .values({
          connectorId,
          sourceItemId,
          sourceFingerprint: contentFingerprint,
        })
        .onConflictDoNothing({
          target: [
            ProjectBrainComposioSyncSourceTable.connectorId,
            ProjectBrainComposioSyncSourceTable.sourceFingerprint,
          ],
        })
        .returning({
          sourceItemId: ProjectBrainComposioSyncSourceTable.sourceItemId,
        });
      if (!sourceLink) {
        const [existing] = await tx
          .select({
            sourceItemId: ProjectBrainComposioSyncSourceTable.sourceItemId,
          })
          .from(ProjectBrainComposioSyncSourceTable)
          .where(
            and(
              eq(ProjectBrainComposioSyncSourceTable.connectorId, connectorId),
              eq(
                ProjectBrainComposioSyncSourceTable.sourceFingerprint,
                contentFingerprint,
              ),
            ),
          )
          .limit(1);
        if (!existing)
          throw new Error("Composio source link could not be persisted");
        await tx
          .delete(CollectionItemTable)
          .where(eq(CollectionItemTable.id, sourceItemId));
        await tx
          .update(ProjectBrainComposioSyncRunTable)
          .set({
            status: "completed",
            sourceItemId: existing.sourceItemId,
            updatedAt: new Date(),
          })
          .where(eq(ProjectBrainComposioSyncRunTable.id, createdRun.id));
        await tx
          .update(ProjectBrainComposioConnectorTable)
          .set({
            lastSyncAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(ProjectBrainComposioConnectorTable.id, connectorId));
        return { sourceItemId: existing.sourceItemId, reused: true };
      }
      const sourceVersionId = await ensureProjectBrainSourceVersion(tx, {
        projectId,
        sourceItemId,
        sourceFingerprint: fingerprint,
        contentSnapshot: sourceText,
      });
      await tx
        .insert(ProjectBrainRunTable)
        .values({
          projectId,
          requestedByUserId: session.user.id,
          sourceItemId,
          sourceVersionId,
          sourceFingerprint: fingerprint,
          status: "queued",
        })
        .onConflictDoNothing({
          target: [
            ProjectBrainRunTable.projectId,
            ProjectBrainRunTable.sourceFingerprint,
          ],
        });
      await tx
        .update(ProjectBrainComposioSyncRunTable)
        .set({ status: "completed", sourceItemId, updatedAt: new Date() })
        .where(eq(ProjectBrainComposioSyncRunTable.id, createdRun.id));
      await tx
        .update(ProjectBrainComposioConnectorTable)
        .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(ProjectBrainComposioConnectorTable.id, connectorId));
      return { sourceItemId, reused: false };
    });
    return Response.json(
      { run: { id: createdRun.id, status: "completed", ...persisted } },
      { status: persisted.reused ? 200 : 201 },
    );
  } catch (error) {
    const isBudgetDenial = error instanceof TeamBudgetExceededError;
    const isBudgetUnavailable = error instanceof TeamBudgetPolicyError;
    const isNoLongerAuthorized = error instanceof TeamBudgetAuthorizationError;
    const message =
      error instanceof Error &&
      /Action is not approved|permissions or arguments changed|returned no usable data/.test(
        error.message,
      )
        ? error.message
        : isBudgetDenial
          ? "This team member's AI allowance has been reached."
          : isBudgetUnavailable
            ? "Team AI budget is unavailable; no source sync was performed."
            : isNoLongerAuthorized
              ? "Project access changed; no source sync was performed."
              : "Composio source sync failed. Check the connection and try again.";
    await pgDb
      .update(ProjectBrainComposioSyncRunTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(ProjectBrainComposioSyncRunTable.id, createdRun.id));
    await pgDb
      .update(ProjectBrainComposioConnectorTable)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(ProjectBrainComposioConnectorTable.id, connectorId));
    return Response.json(
      { error: message, runId: createdRun.id },
      {
        status: isBudgetDenial
          ? 429
          : isNoLongerAuthorized
            ? 403
            : isBudgetUnavailable
              ? 503
              : 502,
      },
    );
  }
}
