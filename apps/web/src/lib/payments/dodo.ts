import "server-only";

import logger from "lib/logger";
import {
  getDodoConfig,
  getDodoProductIdForTier,
  getTierForDodoProductId,
  PAID_TIER_DODO_PRODUCT_ID_ENV,
  type DodoEnvironment,
} from "./dodo-config";
import { verifyDodoWebhookSignature } from "./dodo-webhook-signature";

export {
  getDodoConfig,
  getDodoProductIdForTier,
  getTierForDodoProductId,
  PAID_TIER_DODO_PRODUCT_ID_ENV,
};
export type { DodoEnvironment };

const DODO_BASE_URLS: Record<DodoEnvironment, string> = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
};

export async function isDodoPaymentsEnabled(): Promise<boolean> {
  const config = await getDodoConfig();
  return config.enabled && Boolean(config.apiKey && config.webhookSecret);
}

export async function isDodoApiConfigured(): Promise<boolean> {
  return Boolean((await getDodoConfig()).apiKey);
}

export async function getDodoBaseUrl(): Promise<string> {
  return DODO_BASE_URLS[(await getDodoConfig()).environment];
}

export interface CreateCheckoutSessionInput {
  productId: string;
  quantity?: number;
  customer: { email: string; name?: string; userId: string };
  successUrl: string;
  cancelUrl?: string;
  tier?: string;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  paymentId: string | null;
  clientSecret: string | null;
}

interface CheckoutResponse {
  session_id?: string;
  checkout_url?: string | null;
  payment_id?: string | null;
  client_secret?: string | null;
}

export class DodoPaymentsError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
    this.name = "DodoPaymentsError";
  }
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  const config = await getDodoConfig();
  if (!config.apiKey)
    throw new DodoPaymentsError(
      "Dodo API key not configured",
      503,
      "DODO_NOT_CONFIGURED",
    );
  const baseUrl = DODO_BASE_URLS[config.environment];
  const response = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      product_cart: [
        { product_id: input.productId, quantity: input.quantity ?? 1 },
      ],
      customer: { email: input.customer.email, name: input.customer.name },
      return_url: input.successUrl,
      cancel_url: input.cancelUrl ?? input.successUrl,
      metadata: {
        voidagentUserId: input.customer.userId,
        ...(input.tier ? { tier: input.tier } : {}),
      },
      feature_flags: {
        allow_customer_editing_email: false,
        allow_customer_editing_name: false,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    logger.warn("[dodo] checkout session failed", { status: response.status });
    throw new DodoPaymentsError(
      `Dodo checkout failed (${response.status})`,
      response.status,
      "",
    );
  }
  let parsed: CheckoutResponse;
  try {
    parsed = JSON.parse(text) as CheckoutResponse;
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an invalid checkout response",
      502,
      "",
    );
  }
  if (
    typeof parsed.session_id !== "string" ||
    typeof parsed.checkout_url !== "string"
  ) {
    throw new DodoPaymentsError(
      "Dodo response missing checkout session",
      502,
      "",
    );
  }
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(parsed.checkout_url);
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an invalid checkout URL",
      502,
      "",
    );
  }
  if (
    checkoutUrl.protocol !== "https:" ||
    !["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(
      checkoutUrl.hostname,
    )
  ) {
    throw new DodoPaymentsError(
      "Dodo returned an untrusted checkout URL",
      502,
      "",
    );
  }
  return {
    sessionId: parsed.session_id,
    checkoutUrl: checkoutUrl.toString(),
    paymentId: parsed.payment_id ?? null,
    clientSecret: parsed.client_secret ?? null,
  };
}

export async function createDodoCustomerPortalSession(
  customerId: string,
  returnUrl?: string,
): Promise<{ link: string }> {
  const config = await getDodoConfig();
  if (!config.apiKey)
    throw new DodoPaymentsError(
      "Dodo API key not configured",
      503,
      "DODO_NOT_CONFIGURED",
    );
  if (!/^[A-Za-z0-9_-]{3,128}$/u.test(customerId))
    throw new DodoPaymentsError("Invalid Dodo customer id", 400, "BAD_REQUEST");
  const url = new URL(
    `/customers/${encodeURIComponent(customerId)}/customer-portal/session`,
    DODO_BASE_URLS[config.environment],
  );
  if (returnUrl) {
    const safeReturn = new URL(returnUrl);
    if (safeReturn.protocol !== "https:")
      throw new DodoPaymentsError("Invalid return URL", 400, "BAD_REQUEST");
    url.searchParams.set("return_url", safeReturn.toString());
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    logger.warn("[dodo] customer portal session failed", {
      status: response.status,
    });
    throw new DodoPaymentsError(
      `Dodo portal failed (${response.status})`,
      response.status,
      "",
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an invalid portal response",
      502,
      "",
    );
  }
  const link =
    typeof result === "object" && result !== null && "link" in result
      ? result.link
      : null;
  if (typeof link !== "string")
    throw new DodoPaymentsError("Dodo response missing portal link", 502, "");
  let linkUrl: URL;
  try {
    linkUrl = new URL(link);
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an invalid portal link",
      502,
      "",
    );
  }
  if (
    linkUrl.protocol !== "https:" ||
    !(
      linkUrl.hostname === "dodopayments.com" ||
      linkUrl.hostname.endsWith(".dodopayments.com")
    )
  ) {
    throw new DodoPaymentsError(
      "Dodo returned an untrusted portal link",
      502,
      "",
    );
  }
  return { link: linkUrl.toString() };
}

export interface DodoSubscriptionDetails {
  subscriptionId: string;
  productId: string;
  customerId: string | null;
  status: string;
  previousBillingDate: Date | null;
  nextBillingDate: Date | null;
  cancelAtNextBillingDate: boolean;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}

const toDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function getDodoSubscription(
  id: string,
): Promise<DodoSubscriptionDetails> {
  const config = await getDodoConfig();
  if (!config.apiKey)
    throw new DodoPaymentsError(
      "Dodo API key not configured",
      503,
      "DODO_NOT_CONFIGURED",
    );
  if (!/^[A-Za-z0-9_-]{3,128}$/u.test(id))
    throw new DodoPaymentsError("Invalid subscription id", 400, "BAD_REQUEST");
  const response = await fetch(
    `${DODO_BASE_URLS[config.environment]}/subscriptions/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new DodoPaymentsError(
      `Dodo subscription lookup failed (${response.status})`,
      response.status,
      "",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned invalid subscription data",
      502,
      "",
    );
  }
  const root = parsed as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const customer =
    data.customer && typeof data.customer === "object"
      ? (data.customer as Record<string, unknown>)
      : {};
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : {};
  return {
    subscriptionId:
      typeof data.subscription_id === "string"
        ? data.subscription_id
        : typeof data.id === "string"
          ? data.id
          : id,
    productId: typeof data.product_id === "string" ? data.product_id : "",
    customerId:
      typeof customer.customer_id === "string"
        ? customer.customer_id
        : typeof data.customer_id === "string"
          ? data.customer_id
          : null,
    status: typeof data.status === "string" ? data.status : "unknown",
    previousBillingDate: toDate(
      data.previous_billing_date ?? data.current_period_start,
    ),
    nextBillingDate: toDate(data.next_billing_date ?? data.current_period_end),
    cancelAtNextBillingDate:
      typeof data.cancel_at_next_billing_date === "boolean"
        ? data.cancel_at_next_billing_date
        : data.cancel_at_period_end === true,
    metadata,
    raw: data,
  };
}

export interface ParsedWebhookEvent {
  webhookId: string;
  eventType: string;
  eventTimestamp: Date | null;
  payload: Record<string, unknown>;
}
export async function parseWebhookRequest(
  rawBody: string,
  headers: Headers,
): Promise<ParsedWebhookEvent> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  const config = await getDodoConfig();
  if (
    !verifyDodoWebhookSignature({
      rawBody,
      secret: config.webhookSecret ?? "",
      headers: { id, timestamp, signature },
    })
  ) {
    throw new Error("Invalid webhook signature");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid webhook JSON body");
  }
  return {
    webhookId: id ?? "",
    eventType:
      typeof payload.type === "string"
        ? payload.type
        : typeof payload.event_type === "string"
          ? payload.event_type
          : "unknown",
    eventTimestamp: toDate(payload.timestamp),
    payload,
  };
}
