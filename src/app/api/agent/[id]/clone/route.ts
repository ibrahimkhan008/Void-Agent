import { getSession } from "auth/server";
import { canCreateAgent } from "lib/auth/permissions";
import { clonePublishedAgentForUser } from "lib/db/pg/repositories/agent-clone-repository.pg";
import { isSameOriginRequest } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  if (!(await canCreateAgent()))
    return Response.json(
      { error: "You don't have permission to create agents" },
      { status: 403 },
    );

  const { id: sourceAgentId } = await params;
  if (!z.string().uuid().safeParse(sourceAgentId).success)
    return Response.json({ error: "Invalid agent" }, { status: 400 });

  const rate = await checkApiRateLimit({
    kind: "agent-gallery-clone",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
    });

  try {
    const result = await clonePublishedAgentForUser(
      sourceAgentId,
      session.user.id,
    );
    if (!result)
      return Response.json(
        { error: "Agent not found or not published" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Could not copy this agent" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
