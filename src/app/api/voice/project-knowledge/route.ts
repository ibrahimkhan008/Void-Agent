import { getSession } from "auth/server";
import { createProjectKnowledgeGraphTool } from "lib/ai/tools/project-knowledge";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { getOwnedProjectThreadScope } from "lib/voice/project-status";
import { z } from "zod";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const requestSchema = z
  .object({
    threadId: z.string().uuid(),
    query: z.string().trim().min(2).max(300),
  })
  .strict();

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(
      /\b(authorization|cookie|token|secret|password|api[-_]?key|credential|private[-_]?key)\b\s*[:=]\s*[^\s,;]+/giu,
      "$1=[redacted]",
    )
    .trim()
    .slice(0, max);
}

function safeSourceLabel(value: unknown): string {
  const source = boundedText(value, 200);
  try {
    const url = new URL(source);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}`.slice(0, 160);
  } catch {
    return source.slice(0, 160);
  }
}

function toVoiceKnowledgeResult(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Knowledge search returned an invalid result");
  const result = value as {
    success?: unknown;
    message?: unknown;
    results?: unknown;
    recentEvents?: unknown;
  };
  const facts = Array.isArray(result.results) ? result.results : [];
  const events = Array.isArray(result.recentEvents) ? result.recentEvents : [];
  return {
    success: result.success === true,
    message: boundedText(result.message, 500),
    results: facts.slice(0, 6).map((item) => {
      const fact = item as Record<string, unknown>;
      return {
        claim: boundedText(fact.claim, 240),
        evidence: boundedText(fact.evidence, 320),
        source: safeSourceLabel(fact.source),
      };
    }),
    recentEvents: events.slice(0, 4).map((item) => {
      const event = item as Record<string, unknown>;
      return {
        date: boundedText(event.date, 40) || null,
        summary: boundedText(event.summary, 240),
        detail: boundedText(event.detail, 320),
        evidence: boundedText(event.evidence, 320),
        source: safeSourceLabel(event.source),
      };
    }),
  };
}

/** Search accepted project knowledge using only the active user's owned project chat. */
export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "voice-project-knowledge",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid project knowledge query" },
      { status: 400, headers: noStore },
    );

  try {
    const scope = await getOwnedProjectThreadScope(
      userId,
      parsed.data.threadId,
    );
    if (!scope)
      return Response.json(
        { error: "No project knowledge is available for this chat." },
        { status: 404, headers: noStore },
      );

    const graphTool = createProjectKnowledgeGraphTool({
      userId,
      projectId: scope.projectId,
      collectionIds: scope.collectionIds,
    });
    if (!graphTool.execute)
      throw new Error("Project knowledge search is unavailable");
    const result = await graphTool.execute(
      { query: parsed.data.query },
      {
        toolCallId: "voice-project-knowledge",
        messages: [],
        abortSignal: request.signal,
      },
    );
    return Response.json(toVoiceKnowledgeResult(result), { headers: noStore });
  } catch {
    return Response.json(
      { error: "Project knowledge could not be loaded." },
      { status: 503, headers: noStore },
    );
  }
}
