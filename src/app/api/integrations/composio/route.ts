import { getSession } from "auth/server";
import {
  authorizeComposioToolkit,
  disconnectComposioAccount,
  isComposioConfigured,
  listComposioAccountsForUser,
  listComposioToolkits,
} from "lib/ai/composio";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const toolkitSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const accountSchema = z.string().trim().min(1).max(200);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isComposioConfigured()) {
    return NextResponse.json(
      { configured: false, toolkits: [], accounts: [], nextCursor: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const rate = await checkApiRateLimit({
      kind: "composio-toolkit-list",
      id: session.user.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim();
    const rawLimit = Number(params.get("limit") ?? 30);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 50)
      : 30;
    const [catalog, accounts] = await Promise.all([
      listComposioToolkits(session.user.id, {
        ...(search && search.length >= 3 ? { search } : {}),
        ...(params.get("cursor") ? { cursor: params.get("cursor")! } : {}),
        limit,
      }),
      listComposioAccountsForUser(session.user.id),
    ]);
    const connected = new Map<string, string>();
    for (const account of accounts) {
      const slug = account.toolkit?.slug?.toLowerCase();
      if (slug && !connected.has(slug)) connected.set(slug, account.id);
    }
    const page = catalog as { items?: unknown[]; nextCursor?: string };
    const toolkits = (page.items ?? []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      if (typeof value.slug !== "string" || typeof value.name !== "string")
        return [];
      const slug = value.slug.toLowerCase();
      return [
        {
          slug: value.slug,
          name: value.name,
          ...(typeof value.logo === "string" ? { logo: value.logo } : {}),
          connectedAccountId: connected.get(slug) ?? null,
          isConnected: connected.has(slug),
        },
      ];
    });
    return NextResponse.json(
      {
        configured: true,
        toolkits,
        accounts: accounts.map((account) => ({
          id: account.id,
          toolkit: account.toolkit?.slug ?? "unknown",
          status: "ACTIVE",
        })),
        nextCursor: page.nextCursor ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load connected apps" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isComposioConfigured())
    return new Response("Integration service unavailable", { status: 503 });
  try {
    const rate = await checkApiRateLimit({
      kind: "composio-toolkit-authorize",
      id: session.user.id,
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const raw = await readBoundedJson(request, 4_000);
    if (!raw.ok)
      return new Response("Invalid request", {
        status: raw.tooLarge ? 413 : 400,
      });
    const parsed = z
      .object({ toolkit: toolkitSlugSchema })
      .strict()
      .safeParse(raw.value);
    if (!parsed.success)
      return new Response("Invalid toolkit", { status: 400 });
    // Callback is derived from the same-origin request; clients cannot inject an external redirect.
    const callbackUrl = new URL(
      "/mcp?composio=connected",
      new URL(request.url).origin,
    ).toString();
    const redirectUrl = await authorizeComposioToolkit(
      session.user.id,
      parsed.data.toolkit,
      callbackUrl,
    );
    const parsedRedirect = z.string().url().safeParse(redirectUrl);
    if (!parsedRedirect.success)
      return new Response("Invalid provider redirect", { status: 502 });
    const target = new URL(parsedRedirect.data);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.hash
    ) {
      return new Response("Invalid provider redirect", { status: 502 });
    }
    return NextResponse.json(
      { redirectUrl: target.toString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to start app authorization" },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!isComposioConfigured())
    return new Response("Integration service unavailable", { status: 503 });
  try {
    const rate = await checkApiRateLimit({
      kind: "composio-toolkit-disconnect",
      id: session.user.id,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const raw = await readBoundedJson(request, 2_000);
    if (!raw.ok)
      return new Response("Invalid request", {
        status: raw.tooLarge ? 413 : 400,
      });
    const parsed = z
      .object({ connectedAccountId: accountSchema })
      .strict()
      .safeParse(raw.value);
    if (!parsed.success)
      return new Response("Invalid account", { status: 400 });
    // The provider delete API is global by id. Prove ownership before invoking it.
    const owned = (await listComposioAccountsForUser(session.user.id)).some(
      (account) => account.id === parsed.data.connectedAccountId,
    );
    if (!owned) return new Response("Not found", { status: 404 });
    await disconnectComposioAccount(parsed.data.connectedAccountId);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to disconnect app" },
      { status: 503 },
    );
  }
}
