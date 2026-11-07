import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import {
  getConnectionStatus,
  isRestrictedStripeKey,
  removeStripeConnection,
  saveStripeConnection,
} from "lib/cockpit/stripe";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-stripe-status",
      id: session.user.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
  } catch {
    return new Response("Service unavailable", { status: 503 });
  }
  const requestUrl = new URL(request.url);
  const teamParam = requestUrl.searchParams.get("teamId");
  const teamId = teamParam ? z.string().uuid().safeParse(teamParam) : null;
  if (teamParam && !teamId?.success)
    return new Response("Invalid team", { status: 400 });
  try {
    const access = await resolveStripeScope(
      session.user.id,
      teamId?.success ? teamId.data : null,
    );
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    const connection = await getConnectionStatus(access.scope);
    return Response.json(
      { ...connection, canManage: access.canManage },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load Stripe connection" },
      { status: 500 },
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
      kind: "cockpit-stripe-save",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
  } catch {
    return new Response("Service unavailable", { status: 503 });
  }
  const bodySchema = z
    .object({
      restrictedKey: z.string().max(256).refine(isRestrictedStripeKey),
      teamId: z.string().uuid().nullable().optional(),
    })
    .strict();
  const raw = await readBoundedJson(request, 2048);
  if (!raw.ok)
    return new Response(raw.tooLarge ? "Request too large" : "Invalid JSON", {
      status: raw.tooLarge ? 413 : 400,
    });
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success)
    return Response.json(
      {
        error: "Enter a valid Stripe restricted key (rk_live_… or rk_test_…).",
      },
      { status: 400 },
    );
  try {
    const access = await resolveStripeScope(
      session.user.id,
      parsed.data.teamId ?? null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const connection = await saveStripeConnection(
      access.scope,
      parsed.data.restrictedKey,
    );
    return Response.json(
      { ...connection, canManage: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "encryption_unavailable") {
      return Response.json(
        { error: "Server encryption is not configured." },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Unable to save Stripe connection" },
      { status: 500 },
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
      kind: "cockpit-stripe-remove",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const teamId = rawTeamId ? z.string().uuid().safeParse(rawTeamId) : null;
    if (rawTeamId && !teamId?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      teamId?.success ? teamId.data : null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const removed = await removeStripeConnection(access.scope);
    return removed
      ? Response.json({ ok: true })
      : new Response("Not found", { status: 404 });
  } catch {
    return Response.json(
      { error: "Unable to remove Stripe connection" },
      { status: 500 },
    );
  }
}
