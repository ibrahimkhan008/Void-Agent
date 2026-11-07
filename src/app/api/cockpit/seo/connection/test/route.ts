import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { testStoredSeoConnection } from "lib/cockpit/seo";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try { const rate = await checkApiRateLimit({ kind: "cockpit-seo-test", id: session.user.id, limit: 10, windowMs: 60_000 }); if (!rate.allowed) return new Response("Too many requests", { status: 429 }); }
  catch { return new Response("Service unavailable", { status: 503 }); }
  const raw = await readBoundedJson(request, 2_048);
  if (!raw.ok) return new Response(raw.tooLarge ? "Request too large" : "Invalid JSON", { status: raw.tooLarge ? 413 : 400 });
  const body = z.object({ teamId: z.string().uuid().nullable().optional() }).strict().safeParse(raw.value);
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const access = await resolveStripeScope(session.user.id, body.data.teamId ?? null);
    if (!access.ok || !access.canManage) return new Response("Forbidden", { status: 403 });
    const ok = await testStoredSeoConnection(access.scope);
    return Response.json({ ok }, { status: ok ? 200 : 422, headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ ok: false, error: "Unable to test SEO connection" }, { status: 503 }); }
}
