import { inngest } from "../client";
import logger from "logger";
import { webhookRepository } from "lib/db/pg/repositories/webhook-repository.pg";
import { computeBackoffMs, deliverWebhook, signPayload } from "lib/webhooks";
import {
  HOOK_AGENT_RUN_EVENT,
  dispatchInboundHook,
} from "lib/hooks/executor";

// ---------------------------------------------------------------------------
// Webhook outbox delivery tick (ported from zip-main
// `src/lib/scheduler/outbox-worker.ts`, triage WP6b-T3 2026-11-11).
//
// Staging already ships every piece of the P3.4 outbox design: the
// `webhook_event_outbox` / `webhook_delivery` tables, the repository
// claim/mark methods, and the signing + pinned-delivery helpers in
// `lib/webhooks`. The inbound route enqueues events
// (`app/api/inbound/[token]/route.ts`), but nothing consumed them — the
// zip-main standalone worker was the only driver and it was replaced by
// Inngest. This function completes the pipeline on the same one-minute
// cadence the zip worker used.
//
// One tick:
//   1. Claim up to CLAIM_LIMIT pending events due for delivery.
//   2. Resolve the owner from the event payload; malformed payloads go
//      terminally `failed` so they cannot block the queue.
//   3. For every matching enabled subscription with a signing secret,
//      materialize (or reuse) a `webhook_delivery` row, sign the envelope,
//      POST it, and mark the delivery delivered/failed.
//   4. Mark the event delivered when anything succeeded; otherwise schedule
//      a backoff retry until `max_attempts`, then fail it terminally.
//
// Deviations from the zip-main worker (documented in
// docs/archive/zip-main-triage-api.md):
//   - Leader lock replaced by Inngest `throttle: 1/1m` (single start per
//     minute, so the read-only claim cannot be raced).
//   - Retries reuse the existing delivery row instead of re-inserting (the
//     UNIQUE (event_id, subscription_id) constraint makes a re-insert throw,
//     which poisoned the zip worker's retry path).
//   - Attempt-exhausted and malformed events reach a terminal `failed`
//     status via `failOutboxEvent` instead of looping forever.
//   - Envelope matches the documented receiver contract
//     (`lib/webhooks/receiver-docs.ts`): `eventType`/`payload` fields.
// ---------------------------------------------------------------------------

const CLAIM_LIMIT = 10;
const DELIVERY_TIMEOUT_MS = 10_000;

export interface WebhookOutboxTickResult {
  claimed: number;
  delivered: number;
  failed: number;
  retried: number;
  hooksDispatched: number;
}

const extractUserId = (payload: Record<string, unknown>): string | null => {
  const raw = payload?.userId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
};

export const runWebhookOutboxTick =
  async (): Promise<WebhookOutboxTickResult> => {
    const events = await webhookRepository.claimPendingOutboxEvents(
      new Date(),
      CLAIM_LIMIT,
    );
    const result: WebhookOutboxTickResult = {
      claimed: events.length,
      delivered: 0,
      failed: 0,
      retried: 0,
      hooksDispatched: 0,
    };

    for (const event of events) {
      const userId = extractUserId(event.payload);
      if (!userId) {
        await webhookRepository.failOutboxEvent(
          event.id,
          "payload missing userId",
          null,
        );
        result.failed += 1;
        continue;
      }

      // Void Hooks (master prompt §3.5): inbound events execute the endpoint's
      // bound agent. Idempotent via the hook_run UNIQUE (event_id) — a
      // re-claimed event does nothing here. The event then continues through
      // the normal subscription-delivery path below (both may apply).
      if (event.kind === "inbound") {
        try {
          const dispatch = await dispatchInboundHook({
            eventId: event.id,
            payload: event.payload,
            enqueue: (data) =>
              inngest.send({
                name: HOOK_AGENT_RUN_EVENT,
                data,
              }),
          });
          if (dispatch.dispatched) result.hooksDispatched += 1;
        } catch (error) {
          logger.error(
            `[webhook-outbox] inbound hook dispatch failed for ${event.id}`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      const subscriptions = await webhookRepository.listWebhookSubscriptions(
        userId,
        event.eventType,
      );

      // No subscribers: retire the event so it does not loop on events
      // nobody cares about.
      if (subscriptions.length === 0) {
        await webhookRepository.markOutboxEventDelivered(event.id);
        result.delivered += 1;
        continue;
      }

      // Idempotent retries: the delivery table is UNIQUE
      // (event_id, subscription_id), so reuse existing rows rather than
      // re-inserting, and never re-send to a subscriber already delivered.
      const existing = await webhookRepository.getEventDeliveries(event.id);
      const deliveryBySubscription = new Map(
        existing.map((delivery) => [delivery.subscriptionId, delivery]),
      );

      const envelope = JSON.stringify({
        id: event.id,
        kind: event.kind,
        eventType: event.eventType,
        createdAt: event.createdAt.toISOString(),
        payload: event.payload,
      });

      let anyFailed = false;
      let anySucceeded = false;

      for (const subscription of subscriptions) {
        if (!subscription.enabled) continue;

        const signingSecret =
          await webhookRepository.getWebhookSubscriptionSigningSecret(
            subscription.id,
            subscription.userId,
          );
        if (!signingSecret) continue;

        let delivery = deliveryBySubscription.get(subscription.id);
        if (!delivery) {
          delivery = await webhookRepository.createWebhookDelivery({
            eventId: event.id,
            subscriptionId: subscription.id,
          });
        }
        if (delivery.status === "delivered") {
          anySucceeded = true;
          continue;
        }

        const { signature, timestamp } = signPayload(envelope, signingSecret);
        const outcome = await deliverWebhook({
          url: subscription.url,
          payload: envelope,
          signature,
          timestamp,
          timeoutMs: DELIVERY_TIMEOUT_MS,
        });

        if (outcome.ok) {
          await webhookRepository.markWebhookDeliveryDelivered(delivery.id);
          await webhookRepository.updateWebhookSubscriptionStats(
            subscription.id,
            { lastSuccessAt: new Date() },
          );
          anySucceeded = true;
        } else {
          const reason = outcome.status
            ? `HTTP ${outcome.status} ${outcome.error ?? ""}`.trim()
            : (outcome.error ?? "unknown error");
          await webhookRepository.markWebhookDeliveryFailed(
            delivery.id,
            reason,
          );
          await webhookRepository.updateWebhookSubscriptionStats(
            subscription.id,
            {
              failureCount: subscription.failureCount + 1,
              lastFailureAt: new Date(),
              lastFailureReason: reason.slice(0, 500),
            },
          );
          anyFailed = true;
        }
      }

      const nextAttempt = event.attempts + 1;
      if (anyFailed && !anySucceeded) {
        if (nextAttempt >= event.maxAttempts) {
          await webhookRepository.failOutboxEvent(
            event.id,
            `exceeded max attempts (${event.maxAttempts})`,
            null,
            nextAttempt,
          );
          result.failed += 1;
        } else {
          const backoff = computeBackoffMs(nextAttempt);
          await webhookRepository.failOutboxEvent(
            event.id,
            "delivery failed",
            new Date(Date.now() + backoff),
            nextAttempt,
          );
          result.retried += 1;
        }
      } else {
        // Either all deliveries succeeded, or some did: count the event as
        // delivered. Per-subscriber status lives on the delivery rows.
        await webhookRepository.markOutboxEventDelivered(event.id);
        result.delivered += 1;
      }
    }

    return result;
  };

export const webhookOutboxTick = inngest.createFunction(
  {
    id: "webhook-outbox-tick",
    // The repository claim is read-only, so two overlapping ticks could
    // double-deliver. One start per minute keeps ticks sequential — the
    // zip-main worker used a Postgres advisory leader lock for the same
    // guarantee.
    throttle: { limit: 1, period: "1m" },
    retries: 2,
  },
  { cron: "* * * * *" },
  async ({ step }) => {
    const result = await step.run("deliver-outbox-events", () =>
      runWebhookOutboxTick(),
    );
    if (result.claimed > 0) {
      logger.info("[webhook-outbox] tick", { ...result });
    }
    return result;
  },
);
