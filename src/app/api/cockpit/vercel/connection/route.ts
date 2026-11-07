import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import {
  getVercelConnectionStatus,
  removeVercelConnection,
  saveVercelConnection,
  vercelSubmitSchema,
} from "lib/cockpit/vercel";
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
      kind: "cockpit-vercel-status",
      id: session.user.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsedTeamId = rawTeamId ? teamIdSchema.safeParse(rawTeamId) : null;
    if (rawTeamId && !parsedTeamId?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      parsedTeamId?.success ? parsedTeamId.data : null,
    );
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    const connection = await getVercelConnectionStatus(access.scope);
    return Response.json(
      { ...connection, canManage: access.canManage },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load Vercel connection" },
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
      kind: "cockpit-vercel-save",
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
  const bodySchema = z
    .object({
      teamId: teamIdSchema.nullable().optional(),
      config: vercelSubmitSchema,
    })
    .strict();
  const body = bodySchema.safeParse(raw.value);
  if (!body.success)
    return Response.json(
      { error: "Invalid Vercel connection" },
      { status: 400 },
    );
  try {
    const access = await resolveStripeScope(
      session.user.id,
      body.data.teamId ?? null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const connection = await saveVercelConnection(
      access.scope,
      body.data.config,
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
    if (error instanceof Error && error.message === "invalid_config") {
      return Response.json(
        { error: "A token is required for a new connection." },
        { status: 400 },
      );
    }
    return Response.json(
      { error: "Unable to save Vercel connection" },
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
      kind: "cockpit-vercel-remove",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsedTeamId = rawTeamId ? teamIdSchema.safeParse(rawTeamId) : null;
    if (rawTeamId && !parsedTeamId?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      parsedTeamId?.success ? parsedTeamId.data : null,
    );
    if (!access.ok || !access.canManage)
      return new Response("Forbidden", { status: 403 });
    const removed = await removeVercelConnection(access.scope);
    return removed
      ? Response.json({ ok: true })
      : new Response("Not found", { status: 404 });
  } catch {
    return Response.json(
      { error: "Unable to remove Vercel connection" },
      { status: 503 },
    );
  }
}
