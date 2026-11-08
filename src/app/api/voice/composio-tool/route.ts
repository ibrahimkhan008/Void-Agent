import { getSession } from "auth/server";
import { createComposioVoiceActions } from "lib/ai/composio-voice-tools";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_000;

async function readJson(request: Request): Promise<unknown | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return privateJson({ success: false, error: "Forbidden" }, 403);
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId)
    return privateJson({ success: false, error: "Unauthorized" }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return privateJson({ success: false, error: "Invalid request body" }, 400);

  const payload = body as Record<string, unknown>;
  const actions = createComposioVoiceActions(userId);
  let result: unknown;
  if (payload.operation === "search") {
    result = await actions.search({
      query: payload.query,
      accountRef: payload.accountRef,
    });
  } else if (payload.operation === "execute") {
    result = await actions.execute({
      accountRef: payload.accountRef,
      actionSlug: payload.actionSlug,
      arguments: payload.arguments,
    });
  } else {
    return privateJson({ success: false, error: "Unknown operation" }, 400);
  }
  return privateJson(result);
}
