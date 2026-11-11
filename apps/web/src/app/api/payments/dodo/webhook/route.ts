import "server-only";

import {
  DEFAULT_SUBSCRIPTION_TIER,
  type SubscriptionTierName,
  normalizeSubscriptionTier,
} from "app-types/subscription";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import logger from "lib/logger";
import {
  getDodoProductIdForTier,
  getTierForDodoProductId,
  isDodoPaymentsEnabled,
  parseWebhookRequest,
} from "lib/payments/dodo";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BODY_BYTES = 1024 * 1024;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const dateOrNull = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const numberOr = (value: unknown, fallback = 0): number => {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : fallback;
};
const eventData = (payload: JsonObject): JsonObject =>
  isObject(payload.data) ? payload.data : payload;
const metadata = (data: JsonObject): JsonObject =>
  isObject(data.metadata) ? data.metadata : {};

async function resolveTier(
  productId: string | null,
  meta: JsonObject,
): Promise<SubscriptionTierName | null> {
  const byProduct = await getTierForDodoProductId(productId);
  if (byProduct) return normalizeSubscriptionTier(byProduct);
  const tierName = stringOrNull(meta.tier);
  if (!tierName || tierName === DEFAULT_SUBSCRIPTION_TIER) return null;
  const tier = normalizeSubscriptionTier(tierName);
  const expectedProduct = await getDodoProductIdForTier(tier);
  return expectedProduct && expectedProduct === productId ? tier : null;
}

async function resolveOwner(
  data: JsonObject,
  subscriptionId: string | null,
): Promise<string | null> {
  const meta = metadata(data);
  const metaOwner =
    stringOrNull(meta.flareUserId) ?? stringOrNull(meta.user_id);
  const existing = subscriptionId
    ? await dodoPaymentsRepository.getSubscriptionByDodoId(subscriptionId)
    : null;
  if (metaOwner && existing && existing.userId !== metaOwner) {
    throw new Error("Dodo subscription owner conflicts with the stored owner");
  }
  return existing?.userId ?? metaOwner;
}

async function applyEvent(
  type: string,
  payload: JsonObject,
  eventTimestamp: Date,
): Promise<void> {
  const data = eventData(payload);
  const meta = metadata(data);
  const subscriptionId = stringOrNull(data.subscription_id);
  const productId = stringOrNull(data.product_id);

  if (["subscription.active", "subscription.created"].includes(type)) {
    if (!subscriptionId || !productId)
      throw new Error(
        "Subscription activation is missing required identifiers",
      );
    const owner = await resolveOwner(data, subscriptionId);
    if (!owner) {
      logger.warn("[dodo] subscription event has no bound user");
      return;
    }
    if (!(await userRepository.getUserById(owner))) {
      logger.warn("[dodo] subscription event references deleted user");
      return;
    }
    const tier = await resolveTier(productId, meta);
    if (!tier)
      throw new Error("Subscription product is not mapped to a paid tier");
    const customer = isObject(data.customer) ? data.customer : {};
    await dodoPaymentsRepository.upsertSubscription({
      userId: owner,
      dodoSubscriptionId: subscriptionId,
      eventTimestamp,
      dodoCustomerId:
        stringOrNull(customer.customer_id) ?? stringOrNull(data.customer_id),
      dodoProductId: productId,
      tier,
      status: "active",
      previousBillingDate: dateOrNull(
        data.previous_billing_date ?? data.current_period_start,
      ),
      nextBillingDate: dateOrNull(
        data.next_billing_date ?? data.current_period_end,
      ),
      cancelAtNextBillingDate:
        typeof data.cancel_at_next_billing_date === "boolean"
          ? data.cancel_at_next_billing_date
          : data.cancel_at_period_end === true,
      metadata: meta,
    });
    return;
  }

  if (
    subscriptionId &&
    [
      "subscription.updated",
      "subscription.renewed",
      "subscription.plan_changed",
      "subscription.cancelled",
      "subscription.canceled",
      "subscription.on_hold",
      "subscription.failed",
      "subscription.payment_failed",
    ].includes(type)
  ) {
    const owner = await resolveOwner(data, subscriptionId);
    const existing =
      await dodoPaymentsRepository.getSubscriptionByDodoId(subscriptionId);
    if (!existing) {
      logger.info("[dodo] ignoring state event without an activation record");
      return;
    }
    if (owner !== existing.userId)
      throw new Error("Dodo subscription ownership mismatch");
    const canceled =
      type === "subscription.cancelled" || type === "subscription.canceled";
    const onHold = type === "subscription.on_hold";
    const failed =
      type === "subscription.failed" || type === "subscription.payment_failed";
    const update: Parameters<
      typeof dodoPaymentsRepository.updateSubscription
    >[0] = { dodoSubscriptionId: subscriptionId, eventTimestamp };
    if (canceled) {
      update.status = "cancelled";
      update.cancelledAt = new Date();
      update.cancelAtNextBillingDate = true;
    } else if (onHold) update.status = "on_hold";
    else if (failed) update.status = "failed";
    else {
      update.status = "active";
      const tier = await resolveTier(productId ?? existing.dodoProductId, meta);
      if (tier) update.tier = tier;
      if (productId) update.metadata = meta;
      const customer = isObject(data.customer) ? data.customer : {};
      const customerId =
        stringOrNull(customer.customer_id) ?? stringOrNull(data.customer_id);
      if (customerId) update.dodoCustomerId = customerId;
      if (typeof data.cancel_at_next_billing_date === "boolean")
        update.cancelAtNextBillingDate = data.cancel_at_next_billing_date;
      if (
        data.previous_billing_date !== undefined ||
        data.current_period_start !== undefined
      )
        update.previousBillingDate = dateOrNull(
          data.previous_billing_date ?? data.current_period_start,
        );
      if (
        data.next_billing_date !== undefined ||
        data.current_period_end !== undefined
      )
        update.nextBillingDate = dateOrNull(
          data.next_billing_date ?? data.current_period_end,
        );
    }
    await dodoPaymentsRepository.updateSubscription(update);
    return;
  }

  if (
    [
      "payment.succeeded",
      "payment.completed",
      "payment.failed",
      "refund.succeeded",
      "payment.refunded",
    ].includes(type)
  ) {
    const paymentId = stringOrNull(data.payment_id);
    if (!paymentId) throw new Error("Payment event is missing payment_id");
    const owner = await resolveOwner(data, subscriptionId);
    if (!owner) {
      logger.warn("[dodo] payment event has no bound user");
      return;
    }
    if (!(await userRepository.getUserById(owner))) {
      logger.warn("[dodo] payment event references deleted user");
      return;
    }
    const tier =
      (await resolveTier(productId, meta)) ??
      (subscriptionId
        ? ((
            await dodoPaymentsRepository.getSubscriptionByDodoId(subscriptionId)
          )?.tier ?? null)
        : null);
    if (!tier) throw new Error("Payment product is not mapped to a tier");
    const refunded = type === "refund.succeeded" || type === "payment.refunded";
    const failed = type === "payment.failed";
    await dodoPaymentsRepository.recordPayment({
      userId: owner,
      dodoPaymentId: paymentId,
      eventTimestamp,
      dodoSubscriptionId: subscriptionId,
      amount: numberOr(data.total_amount ?? data.amount) * (refunded ? -1 : 1),
      currency: stringOrNull(data.currency) ?? "USD",
      status: refunded ? "refunded" : failed ? "failed" : "succeeded",
      tier,
      paidAt: failed ? null : (dateOrNull(data.created_at) ?? eventTimestamp),
      metadata: meta,
    });
  }
}

export async function POST(request: Request) {
  if (!(await isDodoPaymentsEnabled()))
    return json({ error: "DODO_NOT_CONFIGURED" }, 503);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES)
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ error: "INVALID_BODY" }, 400);
  }
  if (!bytes) return json({ error: "REQUEST_TOO_LARGE" }, 413);
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return json({ error: "INVALID_BODY" }, 400);
  }
  let event;
  try {
    event = await parseWebhookRequest(rawBody, request.headers);
  } catch {
    return json({ error: "INVALID_SIGNATURE" }, 400);
  }
  if (!event.webhookId) return json({ error: "MISSING_WEBHOOK_ID" }, 400);
  if (
    (event.eventType.startsWith("subscription.") ||
      event.eventType.startsWith("payment.") ||
      event.eventType.startsWith("refund.")) &&
    !event.eventTimestamp
  ) {
    return json({ error: "INVALID_EVENT_TIMESTAMP" }, 400);
  }

  const eventDataValue = eventData(event.payload);
  const eventSummary = {
    eventTimestamp: event.eventTimestamp?.toISOString() ?? null,
    subscriptionId: stringOrNull(eventDataValue.subscription_id),
    paymentId: stringOrNull(eventDataValue.payment_id),
    productId: stringOrNull(eventDataValue.product_id),
  };

  const claim = await dodoPaymentsRepository.recordWebhookReceived(
    event.webhookId,
    event.eventType,
    eventSummary,
  );
  if (!claim.claimed || !claim.claimToken) {
    if (claim.existing?.processedAt)
      return json({ received: true, duplicate: true });
    return json({ received: true, processing: true });
  }
  try {
    await applyEvent(event.eventType, event.payload, event.eventTimestamp!);
    const marked = await dodoPaymentsRepository.markWebhookProcessed(
      event.webhookId,
      claim.claimToken,
    );
    if (!marked) throw new Error("Webhook claim expired before completion");
    return json({ received: true });
  } catch (error) {
    const safeMessage =
      error instanceof Error
        ? error.message
        : "Unknown webhook processing error";
    await dodoPaymentsRepository
      .markWebhookProcessed(event.webhookId, claim.claimToken, safeMessage)
      .catch(() => false);
    logger.error("[dodo] webhook processing failed", {
      eventType: event.eventType,
      error: safeMessage,
    });
    return json({ error: "PROCESSING_FAILED" }, 500);
  }
}
