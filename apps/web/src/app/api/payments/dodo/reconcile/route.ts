import "server-only";

import {
  DEFAULT_SUBSCRIPTION_TIER,
  normalizeSubscriptionTier,
} from "app-types/subscription";
import { getSession } from "auth/server";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  DodoPaymentsError,
  getDodoProductIdForTier,
  getDodoSubscription,
  getTierForDodoProductId,
  isDodoApiConfigured,
} from "lib/payments/dodo";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
const bodySchema = z
  .object({
    subscriptionId: z
      .string()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/u),
  })
  .strict();
const MAX_BODY_BYTES = 2 * 1024;
const ACTIVE_STATES = new Set(["active", "trialing", "past_due"]);
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  if (!hasSameOrigin(request))
    return json({ success: false, error: "INVALID_ORIGIN" }, 403);
  try {
    const rate = await checkApiRateLimit({
      kind: "dodo-reconcile",
      id: userId,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return json({ success: false, error: "RATE_LIMITED" }, 429);
  } catch {
    return json({ success: false, error: "RATE_LIMIT_UNAVAILABLE" }, 503);
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES)
    return json({ success: false, error: "REQUEST_TOO_LARGE" }, 413);
  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ success: false, error: "INVALID_REQUEST" }, 400);
  }
  if (!bytes) return json({ success: false, error: "REQUEST_TOO_LARGE" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return json({ success: false, error: "INVALID_REQUEST" }, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return json({ success: false, error: "INVALID_REQUEST" }, 400);
  if (!(await isDodoApiConfigured()))
    return json({ success: false, error: "DODO_NOT_CONFIGURED" }, 503);

  let details;
  try {
    details = await getDodoSubscription(parsed.data.subscriptionId);
  } catch (error) {
    if (error instanceof DodoPaymentsError && error.status === 404)
      return json({ success: false, error: "SUBSCRIPTION_NOT_FOUND" }, 404);
    return json({ success: false, error: "DODO_LOOKUP_FAILED" }, 502);
  }

  const metadataOwner =
    typeof details.metadata.flareUserId === "string"
      ? details.metadata.flareUserId
      : typeof details.metadata.user_id === "string"
        ? details.metadata.user_id
        : null;
  const existing = await dodoPaymentsRepository.getSubscriptionByDodoId(
    details.subscriptionId,
  );
  const ownerId = metadataOwner ?? existing?.userId ?? null;
  if (!ownerId)
    return json({ success: false, error: "OWNERSHIP_UNKNOWN" }, 403);
  if (ownerId !== userId || (existing && existing.userId !== userId))
    return json({ success: false, error: "OWNERSHIP_MISMATCH" }, 403);
  if (!ACTIVE_STATES.has(details.status))
    return json(
      {
        success: false,
        error: "SUBSCRIPTION_NOT_ACTIVE",
        status: details.status,
      },
      409,
    );
  if (!(await userRepository.getUserById(userId)))
    return json({ success: false, error: "USER_NOT_FOUND" }, 404);

  // A configured product mapping is authoritative; metadata is only a
  // compatibility fallback for old subscriptions whose product was unmapped.
  let tier = await getTierForDodoProductId(details.productId);
  if (!tier) {
    const metadataTier =
      typeof details.metadata.tier === "string" ? details.metadata.tier : null;
    if (!metadataTier || metadataTier === DEFAULT_SUBSCRIPTION_TIER)
      return json({ success: false, error: "UNKNOWN_PRODUCT" }, 409);
    tier = normalizeSubscriptionTier(metadataTier);
    const expectedProduct = await getDodoProductIdForTier(tier);
    if (!expectedProduct || expectedProduct !== details.productId)
      return json({ success: false, error: "PRODUCT_MISMATCH" }, 409);
  }
  await dodoPaymentsRepository.upsertSubscription({
    userId,
    dodoSubscriptionId: details.subscriptionId,
    eventTimestamp: new Date(),
    dodoCustomerId: details.customerId,
    dodoProductId: details.productId,
    tier: normalizeSubscriptionTier(tier),
    status: "active",
    previousBillingDate: details.previousBillingDate,
    nextBillingDate: details.nextBillingDate,
    cancelAtNextBillingDate: details.cancelAtNextBillingDate,
    metadata: details.metadata,
  });
  const subscriptions =
    await dodoPaymentsRepository.listSubscriptionsForUser(userId);
  const active = subscriptions.find((sub) => sub.status === "active") ?? null;
  return json({
    success: true,
    subscriptionId: details.subscriptionId,
    status: details.status,
    tier: active?.tier ?? tier,
  });
}
