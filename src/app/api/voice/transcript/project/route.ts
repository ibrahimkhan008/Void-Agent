import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const requestSchema = z
  .object({ messageId: z.string().uuid(), projectId: z.string().uuid() })
  .strict();

/** Explicitly assigns an owned saved voice conversation to a writable project. */
export async function PATCH(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "voice-transcript-project-assignment",
    id: userId,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const body = await readBoundedJson(request, 1_024);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid transcript or project" },
      { status: 400, headers: noStore },
    );

  try {
    const message = await chatRepository.selectMessage(parsed.data.messageId);
    const thread = message?.threadId
      ? await chatRepository.selectThread(message.threadId)
      : null;
    const transcript =
      message &&
      thread?.userId === userId &&
      message.id === parsed.data.messageId &&
      message.threadId === thread.id &&
      message.role === "user" &&
      (message.metadata?.source === "voice_device" ||
        message.metadata?.source === "voice_realtime")
        ? message.parts
            .flatMap((part) =>
              part.type === "text" && typeof part.text === "string"
                ? [part.text]
                : [],
            )
            .join("\n")
            .trim()
            .slice(0, 24_000)
        : null;
    if (!transcript || !thread?.id)
      return new Response("Transcript not found", {
        status: 404,
        headers: noStore,
      });

    const access = await getProjectAccess(parsed.data.projectId, userId);
    if (!access || !mayEditProject(access.role))
      return new Response("Project not found", {
        status: 404,
        headers: noStore,
      });

    await chatRepository.updateThread(thread.id, {
      projectId: access.project.id,
    });
    return Response.json(
      {
        ok: true,
        threadId: thread.id,
        project: { id: access.project.id, name: access.project.name },
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not assign the transcript to this project" },
      { status: 503, headers: noStore },
    );
  }
}
