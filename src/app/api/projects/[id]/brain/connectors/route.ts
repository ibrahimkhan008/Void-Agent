import { getSession } from "auth/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionTable,
  McpServerTable,
  ProjectBrainMcpConnectorTable,
} from "lib/db/pg/schema.pg";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const attachSchema = z
  .object({
    mcpServerId: z.string().uuid(),
    collectionId: z.string().uuid(),
  })
  .strict();

function isSameOrigin(request: Request) {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const [connectors, servers, collections] = await Promise.all([
    pgDb
      .select({
        id: ProjectBrainMcpConnectorTable.id,
        mcpServerId: ProjectBrainMcpConnectorTable.mcpServerId,
        collectionId: ProjectBrainMcpConnectorTable.collectionId,
        displayName: ProjectBrainMcpConnectorTable.displayName,
        toolNames: ProjectBrainMcpConnectorTable.toolNames,
        status: ProjectBrainMcpConnectorTable.status,
        lastSyncAt: ProjectBrainMcpConnectorTable.lastSyncAt,
        lastError: ProjectBrainMcpConnectorTable.lastError,
        canSync: eq(
          ProjectBrainMcpConnectorTable.credentialOwnerUserId,
          session.user.id,
        ),
      })
      .from(ProjectBrainMcpConnectorTable)
      .where(eq(ProjectBrainMcpConnectorTable.projectId, id)),
    pgDb
      .select({ id: McpServerTable.id, name: McpServerTable.name })
      .from(McpServerTable)
      .where(
        and(
          eq(McpServerTable.userId, session.user.id),
          eq(McpServerTable.enabled, true),
        ),
      ),
    access.project.collectionIds.length
      ? pgDb
          .select({ id: CollectionTable.id, name: CollectionTable.name })
          .from(CollectionTable)
          .where(
            and(
              inArray(CollectionTable.id, access.project.collectionIds),
              collectionScope(session.user.id, access.project.teamId),
            ),
          )
      : Promise.resolve([]),
  ]);
  return Response.json({ connectors, servers, collections });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  if (!isSameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-mcp-attach",
    id: session.user.id,
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed)
    return new Response("Rate limit exceeded", { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid connector selection" },
      { status: 400 },
    );

  const [server] = await pgDb
    .select()
    .from(McpServerTable)
    .where(
      and(
        eq(McpServerTable.id, parsed.data.mcpServerId),
        eq(McpServerTable.userId, session.user.id),
        eq(McpServerTable.enabled, true),
      ),
    );
  const [collection] = await pgDb
    .select()
    .from(CollectionTable)
    .where(
      and(
        eq(CollectionTable.id, parsed.data.collectionId),
        inArray(CollectionTable.id, access.project.collectionIds),
        collectionScope(session.user.id, access.project.teamId),
      ),
    );
  if (!server || !collection)
    return new Response("Connector or attached collection not found", {
      status: 404,
    });

  try {
    const client = await mcpClientsManager.getClient(server.id);
    if (!client)
      return Response.json(
        { error: "MCP connection unavailable" },
        { status: 503 },
      );
    await client.client.connect();
    await client.client.updateToolInfo();
    const toolNames = client.client.toolInfo
      .filter((tool) => tool.annotations?.readOnlyHint === true)
      .map((tool) => tool.name)
      .filter((name) => typeof name === "string" && name.length <= 160)
      .slice(0, 40);
    if (!toolNames.length)
      return Response.json(
        { error: "This server exposes no explicitly read-only tools" },
        { status: 422 },
      );
    const [connector] = await pgDb
      .insert(ProjectBrainMcpConnectorTable)
      .values({
        projectId: id,
        credentialOwnerUserId: session.user.id,
        mcpServerId: server.id,
        collectionId: collection.id,
        displayName: server.name.slice(0, 160),
        toolNames,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [
          ProjectBrainMcpConnectorTable.projectId,
          ProjectBrainMcpConnectorTable.mcpServerId,
        ],
        set: {
          collectionId: collection.id,
          displayName: server.name.slice(0, 160),
          toolNames,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning({
        id: ProjectBrainMcpConnectorTable.id,
        toolNames: ProjectBrainMcpConnectorTable.toolNames,
        displayName: ProjectBrainMcpConnectorTable.displayName,
      });
    return Response.json({ connector }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Unable to inspect the MCP server safely" },
      { status: 503 },
    );
  }
}
