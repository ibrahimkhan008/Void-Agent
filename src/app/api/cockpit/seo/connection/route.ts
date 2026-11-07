import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { getSeoConnectionStatus, removeSeoConnection, saveSeoConnection, seoSubmitSchema } from "lib/cockpit/seo";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const teamSchema = z.string().uuid();
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({ kind: "cockpit-seo-status", id: session.user.id, limit: 60, windowMs: 60_000 });
    if (!rate.allowed) return new Response("Too many requests", { status: 429 });
    const raw = new URL(request.url).searchParams.get("teamId");
    const parsed = raw ? teamSchema.safeParse(raw) : null;
    if (raw && !parsed?.success) return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(session.user.id, parsed?.success ? parsed.data : null);
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    return Response.json({ ...(await getSeoConnectionStatus(access.scope)), canManage: access.canManage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Unable to load SEO connection" }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try { const rate = await checkApiRateLimit({ kind: "cockpit-seo-save", id: session.user.id, limit: 5, windowMs: 60_000 }); if (!rate.allowed) return new Response("Too many requests", { status: 429 }); }
  catch { return new Response("Service unavailable", { status: 503 }); }
  const raw = await readBoundedJson(request, 4_096);
  if (!raw.ok) return new Response(raw.tooLarge ? "Request too large" : "Invalid JSON", { status: raw.tooLarge ? 413 : 400 });
  const body = z.object({ teamId: teamSchema.nullable().optional(), config: seoSubmitSchema }).strict().safeParse(raw.value);
  if (!body.success) return Response.json({ error: "Invalid SEO connection" }, { status: 400 });
  try {
    const access = await resolveStripeScope(session.user.id, body.data.teamId ?? null);
    if (!access.ok || !access.canManage) return new Response("Forbidden", { status: 403 });
    return Response.json({ ...(await saveSeoConnection(access.scope, body.data.config)), canManage: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "encryption_unavailable") return Response.json({ error: "Server encryption is not configured." }, { status: 503 });
    if (error instanceof Error && error.message === "invalid_config") return Response.json({ error: "Enter valid DataForSEO credentials and a bare domain." }, { status: 400 });
    return Response.json({ error: "Unable to save SEO connection" }, { status: 503 });
  }
}
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({ kind: "cockpit-seo-remove", id: session.user.id, limit: 5, windowMs: 60_000 });
    if (!rate.allowed) return new Response("Too many requests", { status: 429 });
    const raw = new URL(request.url).searchParams.get("teamId");
    const parsed = raw ? teamSchema.safeParse(raw) : null;
    if (raw && !parsed?.success) return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(session.user.id, parsed?.success ? parsed.data : null);
    if (!access.ok || !access.canManage) return new Response("Forbidden", { status: 403 });
    return (await removeSeoConnection(access.scope)) ? Response.json({ ok: true }) : new Response("Not found", { status: 404 });
  } catch { return Response.json({ error: "Unable to remove SEO connection" }, { status: 503 }); }
}
