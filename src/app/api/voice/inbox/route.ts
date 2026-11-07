import { getSession } from "auth/server";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ChatMessageTable, ChatThreadTable } from "lib/db/pg/schema.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import {
  VOICE_INBOX_PAGE_SIZE,
  encodeVoiceInboxCursor,
  parseVoiceInboxCursor,
  voiceTranscriptText,
} from "lib/voice/voice-inbox";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const voiceSources = ["voice_device", "voice_realtime"] as const;

export async function GET(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId)
    return new Response("Unauthorized", { status: 401, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "voice-inbox-list",
    id: userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const params = new URL(request.url).searchParams;
  const hasCursor = params.has("cursor");
  const rawCursor = params.get("cursor");
  const cursor = parseVoiceInboxCursor(rawCursor);
  if (hasCursor && !cursor)
    return Response.json(
      { error: "Invalid cursor" },
      { status: 400, headers: noStore },
    );

  try {
    const metadataSource = sql<string>`${ChatMessageTable.metadata}->>'source'`;
    const rows = await pgDb
      .select({
        id: ChatMessageTable.id,
        threadId: ChatMessageTable.threadId,
        parts: ChatMessageTable.parts,
        metadata: ChatMessageTable.metadata,
        createdAt: ChatMessageTable.createdAt,
        title: ChatThreadTable.title,
      })
      .from(ChatMessageTable)
      .innerJoin(
        ChatThreadTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(
        and(
          eq(ChatThreadTable.userId, userId),
          eq(ChatMessageTable.role, "user"),
          inArray(metadataSource, [...voiceSources]),
          cursor
            ? or(
                lt(ChatMessageTable.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(ChatMessageTable.createdAt, new Date(cursor.createdAt)),
                  lt(ChatMessageTable.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
      .limit(VOICE_INBOX_PAGE_SIZE + 1);

    const hasMore = rows.length > VOICE_INBOX_PAGE_SIZE;
    const page = rows.slice(0, VOICE_INBOX_PAGE_SIZE);
    const items = page.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      title: row.title?.slice(0, 120) || "Voice conversation",
      text: voiceTranscriptText(row.parts),
      source: voiceSources.includes(
        row.metadata?.source as (typeof voiceSources)[number],
      )
        ? (row.metadata?.source as (typeof voiceSources)[number])
        : ("voice_realtime" as const),
      createdAt: row.createdAt.toISOString(),
    }));
    const last = page.at(-1);
    return Response.json(
      {
        items,
        nextCursor:
          hasMore && last
            ? encodeVoiceInboxCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not load the voice inbox" },
      { status: 503, headers: noStore },
    );
  }
}
