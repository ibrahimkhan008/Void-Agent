import { randomUUID } from "node:crypto";
import { getSession } from "auth/server";
import {
  CONVERSATION_ARCHIVE_FORMAT,
  CONVERSATION_ARCHIVE_VERSION,
  MAX_CONVERSATION_ARCHIVE_BYTES,
  MAX_CONVERSATION_ARCHIVE_MESSAGES,
  MAX_CONVERSATION_ARCHIVE_MESSAGE_CHARS,
  conversationArchiveSchema,
} from "lib/chat/conversation-archive";
import { chatRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { hasSameOrigin } from "lib/security/same-origin";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId || threadId.length > 128) {
    return Response.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  try {
    const thread = await chatRepository.selectThread(threadId);
    if (!thread || thread.userId !== session.user.id) {
      return new Response("Conversation not found", { status: 404 });
    }

    const rows = await chatRepository.selectMessagesForExport(
      threadId,
      MAX_CONVERSATION_ARCHIVE_MESSAGES + 1,
    );
    if (rows.length > MAX_CONVERSATION_ARCHIVE_MESSAGES) {
      return Response.json(
        { error: "Conversation exceeds the export message limit" },
        { status: 413, headers: privateHeaders },
      );
    }

    const messages = rows.flatMap((message) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      const text = message.parts
        .flatMap((part) =>
          part.type === "text" && typeof part.text === "string"
            ? [part.text]
            : [],
        )
        .join("");
      return text.length > 0 ? [{ role: message.role, text }] : [];
    });
    if (
      messages.some(
        (message) =>
          message.text.length > MAX_CONVERSATION_ARCHIVE_MESSAGE_CHARS,
      )
    ) {
      return Response.json(
        {
          error:
            "Conversation contains a message that exceeds the export limit",
        },
        { status: 413, headers: privateHeaders },
      );
    }
    const archive = {
      format: CONVERSATION_ARCHIVE_FORMAT,
      version: CONVERSATION_ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      title: thread.title.trim().slice(0, 200) || "Conversation",
      messages,
    };
    const body = JSON.stringify(archive);
    if (Buffer.byteLength(body, "utf8") > MAX_CONVERSATION_ARCHIVE_BYTES) {
      return Response.json(
        { error: "Conversation exceeds the export size limit" },
        { status: 413, headers: privateHeaders },
      );
    }

    return new Response(body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="void-agent-conversation.json"',
      },
    });
  } catch {
    return Response.json(
      { error: "Could not export conversation" },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return Response.json(
      { error: "Expected a JSON conversation archive" },
      { status: 415 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_CONVERSATION_ARCHIVE_BYTES
  ) {
    return Response.json({ error: "Archive is too large" }, { status: 413 });
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(
      request,
      MAX_CONVERSATION_ARCHIVE_BYTES,
    );
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (bytes === null) {
    return Response.json({ error: "Archive is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ error: "Invalid JSON archive" }, { status: 400 });
  }
  const parsed = conversationArchiveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid conversation archive" },
      { status: 400 },
    );
  }

  const threadId = randomUUID();
  try {
    await chatRepository.insertThread({
      id: threadId,
      title: parsed.data.title,
      userId: session.user.id,
    });

    if (parsed.data.messages.length > 0) {
      const now = Date.now();
      await chatRepository.insertMessages(
        parsed.data.messages.map((message, index) => ({
          id: randomUUID(),
          threadId,
          role: message.role,
          parts: [{ type: "text", text: message.text }],
          createdAt: new Date(now - parsed.data.messages.length + index),
        })),
      );
    }

    return Response.json(
      { threadId, title: parsed.data.title },
      { status: 201, headers: privateHeaders },
    );
  } catch {
    await chatRepository.deleteThread(threadId).catch(() => undefined);
    return Response.json(
      { error: "Could not import conversation" },
      { status: 500, headers: privateHeaders },
    );
  }
}
