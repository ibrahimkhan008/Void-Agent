import { getSession } from "auth/server";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { SkillsRegistryError, fetchRegistrySkill } from "lib/skills/registry";
import { z } from "zod";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const requestSchema = z.object({
  source: z.string().min(3).max(140),
  slug: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const session = await getSession();
  if (!session?.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const rate = await checkApiRateLimit({
    kind: "skill_registry_import_preview",
    id: session.user.id,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many import requests. Try again later." },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      },
    );
  }
  const body = await readBoundedJsonRequest(request, 512);
  if (!body.ok)
    return Response.json(
      { error: body.error },
      { status: body.status, headers },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid skill source." },
      { status: 400, headers },
    );
  }
  try {
    const skill = await fetchRegistrySkill(
      parsed.data.source,
      parsed.data.slug,
    );
    return Response.json(skill, { headers });
  } catch (error) {
    const status = error instanceof SkillsRegistryError ? error.status : 502;
    return Response.json(
      {
        error:
          error instanceof SkillsRegistryError
            ? error.message
            : "Could not load this skill.",
      },
      { status, headers },
    );
  }
}
