import { getSession } from "auth/server";
import { PRESET_AGENTS } from "lib/ai/agent/presets";
import { canCreateAgent } from "lib/auth/permissions";
import { createAgentFromPreset } from "lib/db/pg/repositories/agent-repository.pg";
import {
  isSameOriginRequest,
  readBoundedJson,
} from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const presetRequestSchema = z
  .object({ presetId: z.string().trim().min(1).max(100) })
  .strict();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isSameOriginRequest(request))
    return new Response("Invalid origin", { status: 403 });
  if (!(await canCreateAgent()))
    return Response.json(
      { error: "You don't have permission to create agents" },
      { status: 403 },
    );

  const rate = await checkApiRateLimit({
    kind: "agent-from-preset",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJson(request, 4_096);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = presetRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json({ error: "presetId is required" }, { status: 400 });

  const preset = PRESET_AGENTS.find(
    (candidate) => candidate.presetId === parsed.data.presetId,
  );
  if (!preset)
    return Response.json({ error: "Unknown preset" }, { status: 404 });

  try {
    const { agentId } = await createAgentFromPreset(session.user.id, preset);
    return Response.json(
      { agentId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to create agent from preset:", error);
    return Response.json(
      { error: "Could not create the agent from this preset" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
