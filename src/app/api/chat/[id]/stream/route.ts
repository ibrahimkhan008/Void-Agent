import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { getSession } from "auth/server";
import {
  clearActiveStream,
  getActiveStream,
  getStreamContext,
} from "lib/ai/chat-stream-context";
import { chatRepository } from "lib/db/repository";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const idSchema = z.string().uuid();
const noStream = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

async function authorizedThread(rawId: string) {
  const session = await getSession();
  if (!session?.user.id)
    return {
      response: new Response("Unauthorized", {
        status: 401,
        headers: { "cache-control": "no-store" },
      }),
    };
  if (!idSchema.safeParse(rawId).success)
    return {
      response: new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" },
      }),
    };
  const thread = await chatRepository.selectThread(rawId);
  if (!thread || thread.userId !== session.user.id)
    return {
      response: new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" },
      }),
    };
  return { thread };
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await authorizedThread(id);
  if (access.response) return access.response;
  if (!getStreamContext() || !(await getActiveStream(id))) return noStream();
  return new Response(null, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await authorizedThread(id);
  if (access.response) return access.response;
  const context = getStreamContext();
  if (!context) return noStream();
  const streamId = await getActiveStream(id);
  if (!streamId) return noStream();
  const resumed = await context.resumeExistingStream(streamId);
  if (!resumed) {
    await clearActiveStream(id, streamId).catch(() => {});
    return noStream();
  }
  return new Response(resumed.pipeThrough(new TextEncoderStream()), {
    headers: { ...UI_MESSAGE_STREAM_HEADERS, "cache-control": "no-store" },
  });
}
