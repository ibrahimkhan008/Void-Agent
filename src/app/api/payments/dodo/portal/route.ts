import "server-only";

import { auth } from "auth/server";
import { getBaseUrl } from "lib/const";
import { dodoPaymentsRepository } from "lib/db/repository";
import logger from "lib/logger";
import {
  DodoPaymentsError,
  createDodoCustomerPortalSession,
} from "lib/payments/dodo";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "INVALID_ORIGIN" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rate = await checkApiRateLimit({
    kind: "dodo-customer-portal",
    id: session.user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      },
    );
  }

  try {
    // Resolve the customer strictly from subscription records owned by the
    // authenticated user. Never accept a customer ID from the request.
    const subscriptions = await dodoPaymentsRepository.listSubscriptionsForUser(
      session.user.id,
    );
    const customerId =
      subscriptions.find(
        (subscription) =>
          subscription.status === "active" && subscription.dodoCustomerId,
      )?.dodoCustomerId ??
      subscriptions.find((subscription) => subscription.dodoCustomerId)
        ?.dodoCustomerId;

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "PORTAL_UNAVAILABLE" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return NextResponse.json(
        { success: false, error: "BASE_URL_NOT_CONFIGURED" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
    const returnUrl = new URL("/profile", baseUrl).toString();
    const portal = await createDodoCustomerPortalSession(customerId, returnUrl);

    return NextResponse.json(
      { success: true, url: portal.link },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DodoPaymentsError && error.status === 503) {
      return NextResponse.json(
        { success: false, error: "DODO_NOT_CONFIGURED" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    logger.error("[dodo] customer portal session creation failed");
    return NextResponse.json(
      { success: false, error: "PORTAL_FAILED" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
