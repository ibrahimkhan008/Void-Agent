import { createHash, randomUUID } from "node:crypto";
import { getSession } from "auth/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  McpServerTable,
  ProjectBrainMcpConnectorTable,
  ProjectBrainMcpSyncRunTable,
  ProjectBrainMcpSyncSourceTable,
  ProjectBrainRunTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { scheduleProjectBrainQueueTick } from "lib/projects/brain-queue";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";
import {
  boundedMcpTextResult,
  isApprovedProjectReadOnlyTool,
  validateMcpToolArguments,
} from "lib/projects/mcp-sync";
import { ensureProjectBrainSourceVersion } from "lib/projects/source-versions";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_SOURCE_CHARS = 60_000;
const syncSchema = z
  .object({
    calls: z
      .array(
        z
          .object({
            toolName: z.string().min(1).max(160),
            arguments: z.record(z.string(), z.unknown()).default({}),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
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
    kind: "project-brain-mcp-sync",
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
    .from(ProjectBrainMcpConnectorTable)
    .where(
      and(
        eq(ProjectBrainMcpConnectorTable.id, connectorId),
        eq(ProjectBrainMcpConnectorTable.projectId, projectId),
        eq(ProjectBrainMcpConnectorTable.status, "active"),
      ),
    );
  if (
    !connector ||
    !access.project.collectionIds.includes(connector.collectionId)
  )
    return new Response("Not found", { status: 404 });
  // Read-only annotations are advisory; only the credential owner may initiate external reads.
  if (connector.credentialOwnerUserId !== session.user.id)
    return new Response("Forbidden", { status: 403 });
  const ownerIds = await getProjectCollectionOwnerIds(access);
  if (!ownerIds.includes(connector.credentialOwnerUserId))
    return new Response("Not found", { status: 404 });
  const [server, collection] = await Promise.all([
    pgDb
      .select()
      .from(McpServerTable)
      .where(
        and(
          eq(McpServerTable.id, connector.mcpServerId),
          eq(McpServerTable.userId, connector.credentialOwnerUserId),
          eq(McpServerTable.enabled, true),
        ),
      ),
    pgDb
      .select()
      .from(CollectionTable)
      .where(
        and(
          eq(CollectionTable.id, connector.collectionId),
          inArray(CollectionTable.id, access.project.collectionIds),
          collectionScope(
            connector.credentialOwnerUserId,
            access.project.teamId,
          ),
        ),
      ),
  ]);
  if (!server[0] || !collection[0])
    return new Response("Connector unavailable", { status: 409 });

  const [createdRun] = await pgDb
    .insert(ProjectBrainMcpSyncRunTable)
    .values({
      connectorId,
      requestedByUserId: session.user.id,
      idempotencyKey,
      status: "running",
    })
    .onConflictDoNothing({
      target: [
        ProjectBrainMcpSyncRunTable.connectorId,
        ProjectBrainMcpSyncRunTable.idempotencyKey,
      ],
    })
    .returning();
  if (!createdRun) {
    const [existing] = await pgDb
      .select({
        id: ProjectBrainMcpSyncRunTable.id,
        status: ProjectBrainMcpSyncRunTable.status,
        sourceItemId: ProjectBrainMcpSyncRunTable.sourceItemId,
      })
      .from(ProjectBrainMcpSyncRunTable)
      .where(
        and(
          eq(ProjectBrainMcpSyncRunTable.connectorId, connectorId),
          eq(ProjectBrainMcpSyncRunTable.idempotencyKey, idempotencyKey),
        ),
      );
    return Response.json(
      { run: existing },
      { status: existing?.status === "completed" ? 200 : 202 },
    );
  }

  try {
    const clientEntry = await mcpClientsManager.getClient(
      connector.mcpServerId,
    );
    if (!clientEntry) throw new Error("MCP server is unavailable");
    await clientEntry.client.connect();
    await clientEntry.client.updateToolInfo();
    const calls = parsed.data.calls;
    const toolInfos = clientEntry.client.toolInfo;
    const results: string[] = [];
    for (const call of calls) {
      if (!connector.toolNames.includes(call.toolName))
        throw new Error(
          "Requested tool is not approved for this project connector",
        );
      const tool = toolInfos.find((entry) => entry.name === call.toolName);
      if (
        !tool ||
        !isApprovedProjectReadOnlyTool(tool, connector.toolNames) ||
        !validateMcpToolArguments(tool, call.arguments)
      ) {
        throw new Error(
          "Tool permissions or arguments changed; reconnect the project source",
        );
      }
      const raw = await mcpClientsManager.toolCall(
        connector.mcpServerId,
        tool.name,
        call.arguments,
      );
      const text = boundedMcpTextResult(raw, MAX_SOURCE_CHARS);
      if (text) results.push(`## ${tool.name}\n${text}`);
    }
    const sourceText = results.join("\n\n").slice(0, MAX_SOURCE_CHARS).trim();
    if (!sourceText)
      throw new Error("The selected read-only tools returned no usable text");

    const existingSources = await pgDb
      .select({
        itemId: ProjectBrainMcpSyncSourceTable.sourceItemId,
        content: DocumentTable.content,
      })
      .from(ProjectBrainMcpSyncSourceTable)
      .innerJoin(
        DocumentTable,
        eq(
          DocumentTable.collectionItemId,
          ProjectBrainMcpSyncSourceTable.sourceItemId,
        ),
      )
      .where(eq(ProjectBrainMcpSyncSourceTable.connectorId, connectorId))
      .limit(25);
    const identicalSource = existingSources.find(
      (source) => source.content === sourceText,
    );
    if (identicalSource) {
      await pgDb
        .update(ProjectBrainMcpSyncRunTable)
        .set({
          status: "completed",
          sourceItemId: identicalSource.itemId,
          updatedAt: new Date(),
        })
        .where(eq(ProjectBrainMcpSyncRunTable.id, createdRun.id));
      await pgDb
        .update(ProjectBrainMcpConnectorTable)
        .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(ProjectBrainMcpConnectorTable.id, connectorId));
      return Response.json(
        {
          run: {
            id: createdRun.id,
            status: "completed",
            sourceItemId: identicalSource.itemId,
            reused: true,
          },
        },
        { status: 200 },
      );
    }

    const sourceItemId = randomUUID();
    const fingerprint = projectBrainSourceFingerprint(sourceItemId, sourceText);
    const contentFingerprint = createHash("sha256")
      .update(sourceText)
      .digest("hex");
    const persisted = await pgDb.transaction(async (tx) => {
      await tx.insert(CollectionItemTable).values({
        id: sourceItemId,
        collectionId: connector.collectionId,
        sourceType: "mcp-sync",
        filename: `${connector.displayName} MCP sync`,
        mediaType: "text/plain",
        status: "ready",
      });
      await tx
        .insert(DocumentTable)
        .values({ collectionItemId: sourceItemId, content: sourceText });
      const [sourceLink] = await tx
        .insert(ProjectBrainMcpSyncSourceTable)
        .values({
          connectorId,
          sourceItemId,
          sourceFingerprint: contentFingerprint,
        })
        .onConflictDoNothing({
          target: [
            ProjectBrainMcpSyncSourceTable.connectorId,
            ProjectBrainMcpSyncSourceTable.sourceFingerprint,
          ],
        })
        .returning({
          sourceItemId: ProjectBrainMcpSyncSourceTable.sourceItemId,
        });
      if (!sourceLink) {
        const [existingLink] = await tx
          .select({ sourceItemId: ProjectBrainMcpSyncSourceTable.sourceItemId })
          .from(ProjectBrainMcpSyncSourceTable)
          .where(
            and(
              eq(ProjectBrainMcpSyncSourceTable.connectorId, connectorId),
              eq(
                ProjectBrainMcpSyncSourceTable.sourceFingerprint,
                contentFingerprint,
              ),
            ),
          )
          .limit(1);
        await tx
          .delete(CollectionItemTable)
          .where(eq(CollectionItemTable.id, sourceItemId));
        if (!existingLink)
          throw new Error("MCP source link could not be persisted");
        await tx
          .update(ProjectBrainMcpSyncRunTable)
          .set({
            status: "completed",
            sourceItemId: existingLink.sourceItemId,
            updatedAt: new Date(),
          })
          .where(eq(ProjectBrainMcpSyncRunTable.id, createdRun.id));
        await tx
          .update(ProjectBrainMcpConnectorTable)
          .set({
            lastSyncAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(ProjectBrainMcpConnectorTable.id, connectorId));
        return { sourceItemId: existingLink.sourceItemId, reused: true };
      }
      const sourceVersionId = await ensureProjectBrainSourceVersion(tx, {
        projectId,
        sourceItemId,
        sourceFingerprint: fingerprint,
        contentSnapshot: sourceText,
      });
      const [brainRun] = await tx
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
        })
        .returning({ id: ProjectBrainRunTable.id });
      await tx
        .update(ProjectBrainMcpSyncRunTable)
        .set({ status: "completed", sourceItemId, updatedAt: new Date() })
        .where(eq(ProjectBrainMcpSyncRunTable.id, createdRun.id));
      await tx
        .update(ProjectBrainMcpConnectorTable)
        .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(ProjectBrainMcpConnectorTable.id, connectorId));
      return { sourceItemId, reused: false, brainRunId: brainRun?.id };
    });
    if (persisted.brainRunId) {
      await scheduleProjectBrainQueueTick(persisted.brainRunId);
    }
    return Response.json(
      {
        run: {
          id: createdRun.id,
          status: "completed",
          sourceItemId: persisted.sourceItemId,
          reused: persisted.reused,
        },
      },
      { status: persisted.reused ? 200 : 201 },
    );
  } catch (error) {
    // Do not persist third-party error text: it may contain credentials or private response data.
    const message =
      error instanceof Error &&
      /approved|permissions|arguments changed|returned no usable text/.test(
        error.message,
      )
        ? error.message
        : "MCP source sync failed. Check the connection and try again.";
    await pgDb
      .update(ProjectBrainMcpSyncRunTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(ProjectBrainMcpSyncRunTable.id, createdRun.id));
    await pgDb
      .update(ProjectBrainMcpConnectorTable)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(ProjectBrainMcpConnectorTable.id, connectorId));
    return Response.json(
      { error: message, runId: createdRun.id },
      { status: 502 },
    );
  }
}
