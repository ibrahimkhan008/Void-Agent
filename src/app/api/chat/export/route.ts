import { ChatExportByThreadIdSchema } from "app-types/chat-export";
import { getSession } from "auth/server";
import { createOwnerChatShare } from "lib/chat/export-share-service";
import {
  isSameOriginRequest,
  readBoundedJson,
} from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import logger from "logger";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const respond = (body: BodyInit | null, status: number) =>
  new Response(body, { status, headers: NO_STORE });

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return respond("Invalid origin", 403);
    const session = await getSession();
    if (!session?.user?.id) {
      logger.warn("Unauthorized export attempt - no session");
      return respond("Unauthorized - Please sign in to export chats", 401);
    }

    const rate = await checkApiRateLimit({
      kind: "chat-export-share",
      id: session.user.id,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          ...NO_STORE,
          "retry-after": String(
            Math.max(1, Math.ceil(rate.retryAfterMs / 1000)),
          ),
        },
      });
    }

    const bounded = await readBoundedJson(req, 4_096);
    if (!bounded.ok) {
      return respond(
        bounded.tooLarge ? "Request too large" : "Invalid JSON",
        bounded.tooLarge ? 413 : 400,
      );
    }
    const parsed = ChatExportByThreadIdSchema.safeParse(bounded.value);
    if (!parsed.success) return respond("Invalid request data", 400);
    const { threadId, expiresAt } = parsed.data;

    const share = await createOwnerChatShare(
      threadId,
      session.user.id,
      expiresAt ?? undefined,
    );

    logger.info("Created an owner-authorized chat share snapshot");
    return Response.json(
      {
        message: "Chat exported successfully",
        exportId: share.exportId,
        shareToken: share.token,
      },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    logger.error("Error exporting chat");
    if (error instanceof Error && error.message === "Thread not found") {
      return respond("Not found", 404);
    }
    return respond("Failed to export chat - Please try again later", 500);
  }
}
