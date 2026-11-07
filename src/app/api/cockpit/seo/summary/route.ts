import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { loadSeoSummary, publicSeoError } from "lib/cockpit/seo";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({ kind: "cockpit-seo-summary", id: session.user.id, limit: 15, windowMs: 60_000 });
    if (!rate.allowed) return new Response("Too many requests", { status: 429 });
    const raw = new URL(request.url).searchParams.get("teamId");
    const parsed = raw ? z.string().uuid().safeParse(raw) : null;
    if (raw && !parsed?.success) return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(session.user.id, parsed?.success ? parsed.data : null);
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    const summary = await loadSeoSummary(access.scope);
    if (!summary) return Response.json({ error: "SEO is not connected" }, { status: 404 });
    return Response.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: publicSeoError(error) }, { status: 502, headers: { "Cache-Control": "private, no-store" } }); }
}
