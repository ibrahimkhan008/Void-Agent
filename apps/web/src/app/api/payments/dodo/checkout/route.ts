import "server-only";

import { randomBytes } from "node:crypto";
import { getSession } from "auth/server";
import { getBaseUrl } from "lib/const";
import { userRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import {
  createCheckoutSession,
  getDodoProductIdForTier,
  isDodoPaymentsEnabled,
} from "lib/payments/dodo";
import { PAID_TIER_DODO_PRODUCT_ID_ENV } from "lib/payments/dodo-config";
import { createUpgradeToken } from "lib/payments/upgrade-token";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
const bodySchema = z
  .object({ tier: z.string().trim().min(1).max(64) })
  .strict();
const MAX_BODY_BYTES = 2 * 1024;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session?.user?.id || !session.user.email)
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  if (!hasSameOrigin(request))
    return json({ success: false, error: "INVALID_ORIGIN" }, 403);
  try {
    const rate = await checkApiRateLimit({
      kind: "dodo-checkout",
      id: session.user.id,
      limit: 10,
      windowMs: 60 * 60 * 1000,
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
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ success: false, error: "INVALID_REQUEST" }, 400);
  }
  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success || !(parsed.data.tier in PAID_TIER_DODO_PRODUCT_ID_ENV)) {
    return json({ success: false, error: "INVALID_TIER" }, 400);
  }
  if (!(await isDodoPaymentsEnabled()))
    return json({ success: false, error: "DODO_NOT_CONFIGURED" }, 503);
  const user = await userRepository.getUserById(session.user.id);
  if (!user || user.id !== session.user.id)
    return json({ success: false, error: "USER_NOT_FOUND" }, 404);
  const productId = await getDodoProductIdForTier(parsed.data.tier);
  if (!productId)
    return json({ success: false, error: "TIER_NOT_CONFIGURED" }, 400);
  const baseUrl = getBaseUrl();
  let publicBase: URL;
  try {
    publicBase = new URL(baseUrl);
  } catch {
    return json({ success: false, error: "BASE_URL_NOT_CONFIGURED" }, 503);
  }
  if (
    process.env.NODE_ENV === "production" &&
    publicBase.protocol !== "https:"
  ) {
    return json({ success: false, error: "BASE_URL_NOT_SECURE" }, 503);
  }
  const nonce = randomBytes(16).toString("base64url");
  const token = createUpgradeToken({ userId: user.id, nonce });
  const successUrl =
    new URL("/profile?upgrade=success", publicBase).toString() +
    (token
      ? `&token=${encodeURIComponent(token)}&session=${encodeURIComponent(nonce)}`
      : "");
  const cancelUrl = new URL(
    "/profile?upgrade=cancelled",
    publicBase,
  ).toString();
  try {
    const checkout = await createCheckoutSession({
      productId,
      customer: { email: user.email, name: user.name, userId: user.id },
      successUrl,
      cancelUrl,
      tier: parsed.data.tier,
    });
    return json({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      sessionId: checkout.sessionId,
    });
  } catch {
    return json({ success: false, error: "CHECKOUT_FAILED" }, 502);
  }
}
