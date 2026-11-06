import { getSession } from "auth/server";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  ProjectBrainMcpConnectorTable,
  ProjectBrainMcpSyncSourceTable,
} from "lib/db/pg/schema.pg";
import { getProjectAccess, mayEditProject } from "lib/projects/access";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function DELETE(
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
  const [connector] = await pgDb
    .select({ id: ProjectBrainMcpConnectorTable.id })
    .from(ProjectBrainMcpConnectorTable)
    .where(
      and(
        eq(ProjectBrainMcpConnectorTable.id, connectorId),
        eq(ProjectBrainMcpConnectorTable.projectId, projectId),
      ),
    );
  if (!connector) return new Response("Not found", { status: 404 });

  await pgDb.transaction(async (tx) => {
    const sourceItems = await tx
      .select({ itemId: ProjectBrainMcpSyncSourceTable.sourceItemId })
      .from(ProjectBrainMcpSyncSourceTable)
      .where(eq(ProjectBrainMcpSyncSourceTable.connectorId, connectorId));
    if (sourceItems.length)
      await tx.delete(CollectionItemTable).where(
        inArray(
          CollectionItemTable.id,
          sourceItems.map(({ itemId }) => itemId),
        ),
      );
    await tx
      .delete(ProjectBrainMcpConnectorTable)
      .where(eq(ProjectBrainMcpConnectorTable.id, connectorId));
  });
  return new Response(null, { status: 204 });
}
