import { getSession } from "auth/server";
import { listOpenSeoServers } from "lib/cockpit/seo";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-seo-mcp-list",
      id: session.user.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const servers = await listOpenSeoServers(session.user.id);
    return Response.json(
      { servers },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load authorized OpenSEO servers" },
      { status: 503 },
    );
  }
}
