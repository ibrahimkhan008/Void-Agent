import { getSession } from "auth/server";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { SkillsRegistryError, searchSkillsRegistry } from "lib/skills/registry";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 100) {
    return Response.json(
      { error: "Search query is too long." },
      { status: 400, headers },
    );
  }
  const rate = await checkApiRateLimit({
    kind: "skill_registry_search",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many searches. Try again shortly." },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      },
    );
  }
  try {
    const skills = await searchSkillsRegistry(query);
    return Response.json({ skills }, { headers });
  } catch (error) {
    const status = error instanceof SkillsRegistryError ? error.status : 502;
    return Response.json(
      {
        skills: [],
        unreachable: true,
        error: "Skills library is temporarily unavailable.",
      },
      { status, headers },
    );
  }
}
