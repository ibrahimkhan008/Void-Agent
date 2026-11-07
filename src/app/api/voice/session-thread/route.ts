import type { UIMessage } from "ai";
import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { getOwnedProjectThreadScope } from "lib/voice/project-status";
import {
  deriveVoiceThreadTitle,
  readVoiceJsonBody,
  voiceSessionThreadRequestSchema,
} from "lib/voice/session-thread-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "voice-session-persist",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many voice saves", { status: 429 });

  const body = await readVoiceJsonBody(request);
  if (!body.ok)
    return Response.json(
      {
        error:
          body.reason === "too-large"
            ? "Request body too large"
            : "Invalid request",
      },
      { status: body.reason === "too-large" ? 413 : 400 },
    );
  const parsed = voiceSessionThreadRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid voice conversation" },
      { status: 400 },
    );

  try {
    const input = parsed.data;
    const existing = await chatRepository.selectThread(input.threadId);
    if (existing && existing.userId !== session.user.id)
      return new Response("Forbidden", { status: 403 });
    if (!existing) {
      const projectScope = input.contextThreadId
        ? await getOwnedProjectThreadScope(
            session.user.id,
            input.contextThreadId,
          )
        : null;
      await chatRepository.upsertThread({
        id: input.threadId,
        userId: session.user.id,
        title: deriveVoiceThreadTitle(input.turns),
        ...(projectScope
          ? {
              projectId: projectScope.projectId,
              collectionIds: projectScope.collectionIds,
            }
          : {}),
      });
    }

    let persisted = 0;
    for (const turn of input.turns) {
      await chatRepository.upsertMessage({
        id: `${input.threadId}:${turn.id}`,
        threadId: input.threadId,
        role: turn.role,
        parts: turn.parts as UIMessage["parts"],
        metadata: {
          source: "voice_realtime",
          voiceSessionId: input.voiceSessionId,
          ...(input.agentId ? { agentId: input.agentId } : {}),
        },
      });
      persisted += 1;
    }
    return Response.json({ ok: true, threadId: input.threadId, persisted });
  } catch {
    return Response.json(
      { error: "Could not save voice conversation" },
      { status: 500 },
    );
  }
}
