import "server-only";

import { createHash } from "node:crypto";
import { pgDb } from "@/lib/db/pg/db.pg";
import { webhookRepository } from "@/lib/db/pg/repositories/webhook-repository.pg";
import { InboundEndpointTable } from "@/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";
import logger from "logger";
import {
  INTERNAL_HOOK_EVENT_TYPES,
  type InternalHookEventType,
} from "./event-types";

export { INTERNAL_HOOK_EVENT_TYPES } from "./event-types";

const EVENT_ALLOWLIST = new Set<string>(INTERNAL_HOOK_EVENT_TYPES);
const MAX_EVENT_TEXT = 8_000;

export function internalHookEventId(input: {
  userId: string;
  eventType: InternalHookEventType;
  sourceId: string;
  endpointId: string;
}): string {
  const hex = createHash("sha256")
    .update(
      `${input.userId}\0${input.eventType}\0${input.sourceId}\0${input.endpointId}`,
    )
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Enqueue matching owner-scoped event hooks on the existing durable outbox.
 * Source mutations call this only after commit; failures are left to callers
 * to log without rolling back the already completed user action.
 */
export async function publishInternalHookEvent(input: {
  userId: string;
  eventType: InternalHookEventType;
  sourceId: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<number> {
  if (!EVENT_ALLOWLIST.has(input.eventType)) return 0;

  let enqueued = 0;
  try {
    const endpoints = await pgDb
      .select({
        id: InboundEndpointTable.id,
        agentId: InboundEndpointTable.agentId,
        hookConfig: InboundEndpointTable.hookConfig,
      })
      .from(InboundEndpointTable)
      .where(
        and(
          eq(InboundEndpointTable.userId, input.userId),
          eq(InboundEndpointTable.kind, "event"),
          eq(InboundEndpointTable.enabled, true),
        ),
      );

    for (const endpoint of endpoints) {
      const config = endpoint.hookConfig as { eventTypes?: unknown } | null;
      const eventTypes = Array.isArray(config?.eventTypes)
        ? config.eventTypes
        : [];
      if (!eventTypes.includes(input.eventType)) continue;
      await webhookRepository.enqueueOutboxEvent({
        id: internalHookEventId({ ...input, endpointId: endpoint.id }),
        kind: "inbound",
        eventType: `internal.${input.eventType}`,
        payload: {
          userId: input.userId,
          agentId: endpoint.agentId,
          endpointId: endpoint.id,
          normalized: {
            source: input.eventType,
            kind: input.eventType,
            text: input.text.slice(0, MAX_EVENT_TEXT),
            meta: input.meta ?? {},
          },
        },
      });
      enqueued += 1;
    }
  } catch (error) {
    // Hook delivery is an optional side effect. Never turn a committed
    // project/memory/workflow mutation into an apparent failure if the hook
    // catalog or outbox is temporarily unavailable.
    logger.warn("[hooks] failed to publish internal event", {
      eventType: input.eventType,
      sourceId: input.sourceId,
      enqueued,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return enqueued;
}
