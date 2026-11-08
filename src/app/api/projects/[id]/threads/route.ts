import { getSession } from "auth/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ChatMessageTable, ChatThreadTable } from "lib/db/pg/schema.pg";
import { getProjectAccess } from "lib/projects/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });

  // Project membership grants access to project knowledge, but does not grant
  // access to another member's private conversation history.
  const threads = await pgDb
    .select({
      id: ChatThreadTable.id,
      title: ChatThreadTable.title,
      createdAt: ChatThreadTable.createdAt,
      lastMessageAt: sql<string | null>`MAX(${ChatMessageTable.createdAt})`.as(
        "last_message_at",
      ),
    })
    .from(ChatThreadTable)
    .leftJoin(
      ChatMessageTable,
      eq(ChatThreadTable.id, ChatMessageTable.threadId),
    )
    .where(
      and(
        eq(ChatThreadTable.projectId, projectId),
        eq(ChatThreadTable.userId, session.user.id),
      ),
    )
    .groupBy(ChatThreadTable.id)
    .orderBy(
      desc(
        sql`COALESCE(MAX(${ChatMessageTable.createdAt}), ${ChatThreadTable.createdAt})`,
      ),
    )
    .limit(50);

  return Response.json(
    { threads },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
