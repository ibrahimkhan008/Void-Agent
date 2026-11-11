import "server-only";

import { getSession } from "auth/server";
import { getBaseUrl } from "lib/const";
import { dodoPaymentsRepository } from "lib/db/repository";
import {
  DodoPaymentsError,
  createDodoCustomerPortalSession,
} from "lib/payments/dodo";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
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
      kind: "dodo-customer-portal",
      id: userId,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return json({ success: false, error: "RATE_LIMITED" }, 429);
  } catch {
    return json({ success: false, error: "RATE_LIMIT_UNAVAILABLE" }, 503);
  }

  const subscriptions =
    await dodoPaymentsRepository.listSubscriptionsForUser(userId);
  const customerId =
    subscriptions.find((sub) => sub.status === "active" && sub.dodoCustomerId)
      ?.dodoCustomerId ??
    subscriptions.find((sub) => sub.dodoCustomerId)?.dodoCustomerId;
  if (!customerId)
    return json({ success: false, error: "PORTAL_UNAVAILABLE" }, 409);

  let baseUrl: URL;
  try {
    baseUrl = new URL(getBaseUrl());
  } catch {
    return json({ success: false, error: "BASE_URL_NOT_CONFIGURED" }, 503);
  }
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:")
    return json({ success: false, error: "BASE_URL_NOT_SECURE" }, 503);
  try {
    const portal = await createDodoCustomerPortalSession(
      customerId,
      new URL("/profile", baseUrl).toString(),
    );
    return json({ success: true, url: portal.link });
  } catch (error) {
    const status =
      error instanceof DodoPaymentsError && error.status === 503 ? 503 : 502;
    return json(
      {
        success: false,
        error: status === 503 ? "DODO_NOT_CONFIGURED" : "PORTAL_FAILED",
      },
      status,
    );
  }
}
