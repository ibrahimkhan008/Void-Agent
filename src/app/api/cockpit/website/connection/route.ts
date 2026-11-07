import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import {
  getWebsiteConnectionStatus,
  removeWebsiteConnection,
  saveWebsiteConnection,
  websiteSubmitSchema,
} from "lib/cockpit/website";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const teamIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-website-status",
      id: session.user.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsed = rawTeamId ? teamIdSchema.safeParse(rawTeamId) : null;
    if (rawTeamId && !parsed?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      parsed?.success ? parsed.data : null,
    );
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    return Response.json(
      {
        ...(await getWebsiteConnectionStatus(access.scope)),
        canManage: access.canManage,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load website connection" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-website-save",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
  } catch {
    return new Response("Service unavailable", { status: 503 });
  }
  const raw = await readBoundedJson(request, 16_000);
  if (!raw.ok)
    return new Response(raw.tooLarge ? "Request too large" : "Invalid JSON", {
      status: raw.tooLarge ? 413 : 400,
    });
  const parsed = z
    .object({
      teamId: teamIdSchema.nullable().optional(),
      config: websiteSubmitSchema,
    })
    .strict()
    .safeParse(raw.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid website connection" },
      { status: 400 },
    );
  try {
    const access = await resolveStripeScope(
      session.user.id,
      parsed.data.teamId ?? null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const status = await saveWebsiteConnection(
      access.scope,
      parsed.data.config,
    );
    return Response.json(
      { ...status, canManage: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "encryption_unavailable")
      return Response.json(
        { error: "Server encryption is not configured." },
        { status: 503 },
      );
    if (error instanceof Error && error.message === "invalid_config")
      return Response.json(
        { error: "A valid Supabase URL and secret key are required." },
        { status: 400 },
      );
    return Response.json(
      { error: "Unable to save website connection" },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-website-remove",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsed = rawTeamId ? teamIdSchema.safeParse(rawTeamId) : null;
    if (rawTeamId && !parsed?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      parsed?.success ? parsed.data : null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    return (await removeWebsiteConnection(access.scope))
      ? Response.json({ ok: true })
      : new Response("Not found", { status: 404 });
  } catch {
    return Response.json(
      { error: "Unable to remove website connection" },
      { status: 503 },
    );
  }
}
