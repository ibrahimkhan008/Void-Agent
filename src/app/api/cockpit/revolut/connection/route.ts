import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import {
  getRevolutConnectionStatus,
  removeRevolutConnection,
  revolutSubmitSchema,
  saveRevolutConnection,
} from "lib/cockpit/revolut";
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
      kind: "cockpit-revolut-status",
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
    const status = await getRevolutConnectionStatus(access.scope);
    return Response.json(
      { ...status, canManage: access.canManage },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load Revolut connection" },
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
      kind: "cockpit-revolut-save",
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
      config: revolutSubmitSchema,
    })
    .strict()
    .safeParse(raw.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid Revolut connection" },
      { status: 400 },
    );
  try {
    const access = await resolveStripeScope(
      session.user.id,
      parsed.data.teamId ?? null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const status = await saveRevolutConnection(
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
    if (error instanceof Error && error.message === "authorization_required")
      return Response.json(
        {
          error:
            "Enter a Revolut authorization code to connect or change credentials.",
        },
        { status: 400 },
      );
    if (error instanceof Error && error.message === "invalid_config")
      return Response.json(
        { error: "A valid client ID and RSA private key are required." },
        { status: 400 },
      );
    if (error instanceof Error && error.message === "reauthorize")
      return Response.json(
        { error: "Revolut rejected the authorization code or credentials." },
        { status: 422 },
      );
    return Response.json(
      { error: "Unable to save Revolut connection" },
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
      kind: "cockpit-revolut-remove",
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
    return (await removeRevolutConnection(access.scope))
      ? Response.json({ ok: true })
      : new Response("Not found", { status: 404 });
  } catch {
    return Response.json(
      { error: "Unable to remove Revolut connection" },
      { status: 503 },
    );
  }
}
