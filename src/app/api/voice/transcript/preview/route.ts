import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import {
  getProjectAccess,
  listProjectsForUser,
  mayEditProject,
} from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { getVoiceTranscriptForHandoff } from "lib/voice/handoff";
import { previewVoiceTranscript } from "lib/voice/transcript-preview";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ messageId: z.string().uuid() }).strict();
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "voice-transcript-preview",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many preview requests", {
      status: 429,
      headers: noStore,
    });

  const body = await readBoundedJson(request, 1_024);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid message ID" },
      { status: 400, headers: noStore },
    );

  try {
    const message = await chatRepository.selectMessage(parsed.data.messageId);
    if (!message?.threadId)
      return new Response("Transcript not found", {
        status: 404,
        headers: noStore,
      });
    const thread = await chatRepository.selectThread(message.threadId);
    const text = getVoiceTranscriptForHandoff({
      userId: session.user.id,
      requestedUserId: thread?.userId ?? "",
      threadId: message.threadId,
      messageId: parsed.data.messageId,
      message,
    });
    if (!text)
      return new Response("Transcript not found", {
        status: 404,
        headers: noStore,
      });

    // This path only reads the owned transcript and asks for a structured
    // classification. It does not create records or invoke tools/connectors.
    const listedProjects = await listProjectsForUser(session.user.id);
    const projects = (
      await Promise.all(
        listedProjects.map(async (project) => {
          const access = await getProjectAccess(project.id, session.user.id);
          return access && mayEditProject(access.role) ? project : null;
        }),
      )
    ).filter((project) => project !== null);
    const classifiedPreview = await previewVoiceTranscript(
      text,
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
      })),
    );
    const suggestedProject = projects.find(
      (project) => project.id === classifiedPreview.suggestedProjectId,
    );
    const preview = {
      ...classifiedPreview,
      suggestedProjectId: suggestedProject?.id ?? null,
    };
    return Response.json(
      {
        preview,
        suggestedProject: suggestedProject
          ? { id: suggestedProject.id, name: suggestedProject.name }
          : null,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not preview voice transcript" },
      { status: 500, headers: noStore },
    );
  }
}
