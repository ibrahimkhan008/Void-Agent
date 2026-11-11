import "server-only";

import { getSession } from "auth/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_LOOKBACK = 50;
const requestSchema = z
  .object({ securityEventsLookback: z.number().int().min(1).max(500) })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function requireAdmin() {
  try {
    await requireAdminPermission("manage security settings");
    const session = await getSession();
    if (!session?.user) return null;
    return session.user;
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Unauthorized" }, 401);

  try {
    const config = await siteConfigRepository.getConfig("security");
    const value = config?.securityEventsLookback;
    const securityEventsLookback =
      typeof value === "number" && Number.isInteger(value)
        ? Math.max(1, Math.min(500, value))
        : DEFAULT_LOOKBACK;
    return json({ securityEventsLookback });
  } catch {
    return json({ error: "Could not load security settings" }, 500);
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return json({ error: "Unauthorized" }, 401);
  if (!hasSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  try {
    const rateLimit = await checkApiRateLimit({
      kind: "admin-security-settings",
      id: admin.id,
      limit: 10,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.allowed) return json({ error: "Rate limit exceeded" }, 429);

    const bytes = await readBoundedRequestBody(request, 1_024);
    if (!bytes) return json({ error: "Request body too large" }, 413);

    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) return json({ error: "Invalid settings" }, 400);

    const current = (await siteConfigRepository.getConfig("security")) ?? {};
    await siteConfigRepository.upsert(
      "security",
      {
        ...current,
        securityEventsLookback: parsed.data.securityEventsLookback,
      },
      admin.id,
      "update",
    );
    return json({ securityEventsLookback: parsed.data.securityEventsLookback });
  } catch {
    return json({ error: "Could not save security settings" }, 500);
  }
}
