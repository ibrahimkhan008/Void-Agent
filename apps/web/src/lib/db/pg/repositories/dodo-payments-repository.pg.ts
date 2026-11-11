import "server-only";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SUBSCRIPTION_TIER,
  SubscriptionTierName,
  normalizeSubscriptionTier,
} from "app-types/subscription";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  DodoPaymentEntity,
  DodoPaymentTable,
  DodoSubscriptionEntity,
  DodoSubscriptionTable,
  DodoWebhookEventEntity,
  DodoWebhookEventTable,
  UserTable,
} from "../schema.pg";

export interface CreateDodoSubscriptionInput {
  userId: string;
  dodoSubscriptionId: string;
  eventTimestamp: Date;
  dodoCustomerId?: string | null;
  dodoProductId: string;
  tier?: SubscriptionTierName;
  status?: DodoSubscriptionEntity["status"];
  previousBillingDate?: Date | null;
  nextBillingDate?: Date | null;
  cancelAtNextBillingDate?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateDodoSubscriptionInput {
  dodoSubscriptionId: string;
  eventTimestamp: Date;
  status?: DodoSubscriptionEntity["status"];
  tier?: SubscriptionTierName;
  dodoCustomerId?: string | null;
  previousBillingDate?: Date | null;
  nextBillingDate?: Date | null;
  cancelAtNextBillingDate?: boolean;
  cancelledAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface CreateDodoPaymentInput {
  userId: string;
  dodoPaymentId: string;
  eventTimestamp: Date;
  dodoSubscriptionId?: string | null;
  amount: number;
  currency: string;
  status: string;
  tier: SubscriptionTierName;
  paidAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface DodoPaymentsRepository {
  // Subscriptions
  upsertSubscription(
    input: CreateDodoSubscriptionInput,
  ): Promise<DodoSubscriptionEntity>;
  updateSubscription(
    input: UpdateDodoSubscriptionInput,
  ): Promise<DodoSubscriptionEntity | null>;
  getSubscriptionByDodoId(
    dodoSubscriptionId: string,
  ): Promise<DodoSubscriptionEntity | null>;
  getActiveSubscriptionForUser(
    userId: string,
  ): Promise<DodoSubscriptionEntity | null>;
  listSubscriptionsForUser(userId: string): Promise<DodoSubscriptionEntity[]>;
  syncUserTierFromSubscription(userId: string): Promise<SubscriptionTierName>;

  // Payments
  recordPayment(input: CreateDodoPaymentInput): Promise<DodoPaymentEntity>;
  getPaymentByDodoId(dodoPaymentId: string): Promise<DodoPaymentEntity | null>;
  listPaymentsForUser(userId: string): Promise<DodoPaymentEntity[]>;

  // Webhook idempotency
  recordWebhookReceived(
    webhookId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{
    claimed: boolean;
    claimToken: string | null;
    existing: DodoWebhookEventEntity | null;
  }>;
  markWebhookProcessed(
    webhookId: string,
    claimToken: string,
    error?: string,
  ): Promise<boolean>;
}

const tierForSubscription = (
  subscription: Pick<DodoSubscriptionEntity, "tier" | "status">,
): SubscriptionTierName => {
  if (subscription.status === "active") {
    return normalizeSubscriptionTier(subscription.tier);
  }
  // Any non-active state (cancelled, on_hold, expired, failed, pending)
  // demotes the user to the free tier.
  return DEFAULT_SUBSCRIPTION_TIER;
};

export const pgDodoPaymentsRepository: DodoPaymentsRepository = {
  upsertSubscription: async (input) => {
    const tier = input.tier ?? DEFAULT_SUBSCRIPTION_TIER;
    const values = {
      userId: input.userId,
      dodoSubscriptionId: input.dodoSubscriptionId,
      dodoCustomerId: input.dodoCustomerId ?? null,
      dodoProductId: input.dodoProductId,
      tier,
      status: input.status ?? ("pending" as const),
      previousBillingDate: input.previousBillingDate ?? null,
      nextBillingDate: input.nextBillingDate ?? null,
      cancelAtNextBillingDate: input.cancelAtNextBillingDate ?? false,
      metadata: input.metadata ?? {},
      lastEventAt: input.eventTimestamp,
    };

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(DodoSubscriptionTable)
        .values(values)
        .onConflictDoUpdate({
          target: DodoSubscriptionTable.dodoSubscriptionId,
          setWhere: lt(DodoSubscriptionTable.lastEventAt, input.eventTimestamp),
          set: {
            dodoCustomerId: values.dodoCustomerId,
            dodoProductId: values.dodoProductId,
            tier: values.tier,
            status: values.status,
            previousBillingDate: values.previousBillingDate,
            nextBillingDate: values.nextBillingDate,
            cancelAtNextBillingDate: values.cancelAtNextBillingDate,
            metadata: values.metadata,
            lastEventAt: values.lastEventAt,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) {
        const [current] = await tx
          .select()
          .from(DodoSubscriptionTable)
          .where(
            eq(
              DodoSubscriptionTable.dodoSubscriptionId,
              input.dodoSubscriptionId,
            ),
          )
          .for("update");
        if (!current) throw new Error("Failed to upsert Dodo subscription");
        // A stale event is acknowledged without changing the current entitlement.
        return current;
      }
      const tierToApply = tierForSubscription(row);
      await tx
        .update(UserTable)
        .set({ tier: tierToApply, updatedAt: new Date() })
        .where(eq(UserTable.id, row.userId));
      return row;
    });
  },

  updateSubscription: async (input) => {
    const updates: Partial<DodoSubscriptionEntity> = {
      updatedAt: new Date(),
      lastEventAt: input.eventTimestamp,
    };
    if (input.status !== undefined) updates.status = input.status;
    if (input.tier !== undefined) updates.tier = input.tier;
    if (input.dodoCustomerId !== undefined)
      updates.dodoCustomerId = input.dodoCustomerId;
    if (input.previousBillingDate !== undefined)
      updates.previousBillingDate = input.previousBillingDate;
    if (input.nextBillingDate !== undefined)
      updates.nextBillingDate = input.nextBillingDate;
    if (input.cancelAtNextBillingDate !== undefined)
      updates.cancelAtNextBillingDate = input.cancelAtNextBillingDate;
    if (input.cancelledAt !== undefined)
      updates.cancelledAt = input.cancelledAt;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(DodoSubscriptionTable)
        .set(updates)
        .where(
          and(
            eq(
              DodoSubscriptionTable.dodoSubscriptionId,
              input.dodoSubscriptionId,
            ),
            lt(DodoSubscriptionTable.lastEventAt, input.eventTimestamp),
          ),
        )
        .returning();
      if (!row) return null;

      // If another Dodo subscription is still active, its tier remains the
      // entitlement source. If none remains, cancellation/on-hold/failed
      // clears the legacy paid tier in the same transaction as the status.
      const [active] = await tx
        .select({ tier: DodoSubscriptionTable.tier })
        .from(DodoSubscriptionTable)
        .where(
          and(
            eq(DodoSubscriptionTable.userId, row.userId),
            eq(DodoSubscriptionTable.status, "active"),
          ),
        )
        .orderBy(desc(DodoSubscriptionTable.lastEventAt))
        .limit(1);
      const tierToApply = active
        ? normalizeSubscriptionTier(active.tier)
        : DEFAULT_SUBSCRIPTION_TIER;
      await tx
        .update(UserTable)
        .set({ tier: tierToApply, updatedAt: new Date() })
        .where(eq(UserTable.id, row.userId));
      return row;
    });
  },

  getSubscriptionByDodoId: async (dodoSubscriptionId) => {
    const [row] = await db
      .select()
      .from(DodoSubscriptionTable)
      .where(eq(DodoSubscriptionTable.dodoSubscriptionId, dodoSubscriptionId))
      .limit(1);
    return row ?? null;
  },

  getActiveSubscriptionForUser: async (userId) => {
    const [row] = await db
      .select()
      .from(DodoSubscriptionTable)
      .where(
        and(
          eq(DodoSubscriptionTable.userId, userId),
          eq(DodoSubscriptionTable.status, "active"),
        ),
      )
      .orderBy(desc(DodoSubscriptionTable.lastEventAt))
      .limit(1);
    return row ?? null;
  },

  listSubscriptionsForUser: async (userId) => {
    return db
      .select()
      .from(DodoSubscriptionTable)
      .where(eq(DodoSubscriptionTable.userId, userId))
      .orderBy(desc(DodoSubscriptionTable.lastEventAt));
  },

  syncUserTierFromSubscription: async (userId) => {
    const sub =
      await pgDodoPaymentsRepository.getActiveSubscriptionForUser(userId);

    // Read the user's current tier so we can:
    //   1. Decide whether an update is needed at all (avoids a
    //      no-op write that would still bump `updatedAt` and lose
    //      any other state in the row).
    //   2. Preserve the existing tier when there's no active
    //      subscription row. This matters because the profile page
    //      calls sync on every load — if the user had a paid tier
    //      and the webhook for a renewal hasn't arrived yet, the
    //      previous version of this function would demote them to
    //      free tier and assign no plan. Now we leave the tier
    //      alone in the empty-read case.
    const [userRow] = await db
      .select({ tier: UserTable.tier })
      .from(UserTable)
      .where(eq(UserTable.id, userId))
      .limit(1);

    if (!userRow) {
      // User was deleted between auth and this call. Nothing to do.
      return DEFAULT_SUBSCRIPTION_TIER;
    }

    const currentTier = normalizeSubscriptionTier(userRow.tier);

    if (!sub) {
      // No active subscription row. Preserve whatever tier the user
      // currently has. If they had a paid tier and the webhook is
      // still in flight, that tier is correct; if they were
      // genuinely downgraded by a cancellation webhook, that
      // webhook handler (handleSubscriptionCancelled) has already
      // written tier=DEFAULT, so the cached value is also correct.
      return currentTier;
    }

    const targetTier = normalizeSubscriptionTier(sub.tier);
    if (targetTier === currentTier) {
      // Already in sync — skip the write to avoid bumping
      // updatedAt unnecessarily.
      return targetTier;
    }

    await db
      .update(UserTable)
      .set({ tier: targetTier, updatedAt: new Date() })
      .where(eq(UserTable.id, userId));

    return targetTier;
  },

  recordPayment: async (input) => {
    const [row] = await db
      .insert(DodoPaymentTable)
      .values({
        userId: input.userId,
        dodoPaymentId: input.dodoPaymentId,
        dodoSubscriptionId: input.dodoSubscriptionId ?? null,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        tier: input.tier,
        paidAt: input.paidAt ?? null,
        metadata: input.metadata ?? {},
        lastEventAt: input.eventTimestamp,
      })
      .onConflictDoUpdate({
        target: DodoPaymentTable.dodoPaymentId,
        set: {
          status: input.status,
          paidAt: input.paidAt ?? null,
          metadata: input.metadata ?? {},
          amount: input.amount,
          currency: input.currency,
          tier: input.tier,
          dodoSubscriptionId: input.dodoSubscriptionId ?? null,
          lastEventAt: input.eventTimestamp,
        },
        setWhere: lt(DodoPaymentTable.lastEventAt, input.eventTimestamp),
      })
      .returning();

    if (!row) {
      const [current] = await db
        .select()
        .from(DodoPaymentTable)
        .where(eq(DodoPaymentTable.dodoPaymentId, input.dodoPaymentId))
        .limit(1);
      if (!current) throw new Error("Failed to record Dodo payment");
      return current;
    }
    return row;
  },

  getPaymentByDodoId: async (dodoPaymentId) => {
    const [row] = await db
      .select()
      .from(DodoPaymentTable)
      .where(eq(DodoPaymentTable.dodoPaymentId, dodoPaymentId))
      .limit(1);
    return row ?? null;
  },

  listPaymentsForUser: async (userId) => {
    return db
      .select()
      .from(DodoPaymentTable)
      .where(eq(DodoPaymentTable.userId, userId))
      .orderBy(desc(DodoPaymentTable.createdAt));
  },

  recordWebhookReceived: async (webhookId, eventType, payload) => {
    const claimToken = randomUUID();
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + 2 * 60_000);
    const inserted = await db
      .insert(DodoWebhookEventTable)
      .values({ webhookId, eventType, payload, claimToken, claimExpiresAt })
      .onConflictDoNothing({ target: DodoWebhookEventTable.webhookId })
      .returning();

    if (inserted.length > 0) {
      return { claimed: true, claimToken, existing: inserted[0] ?? null };
    }

    // Conditional update is the single-writer claim for unfinished retries.
    const [claimed] = await db
      .update(DodoWebhookEventTable)
      .set({
        attempts: sql`${DodoWebhookEventTable.attempts} + 1`,
        claimToken,
        claimExpiresAt,
      })
      .where(
        and(
          eq(DodoWebhookEventTable.webhookId, webhookId),
          isNull(DodoWebhookEventTable.processedAt),
          or(
            isNull(DodoWebhookEventTable.claimExpiresAt),
            lt(DodoWebhookEventTable.claimExpiresAt, now),
          ),
        ),
      )
      .returning();
    if (claimed) return { claimed: true, claimToken, existing: claimed };

    const [existing] = await db
      .select()
      .from(DodoWebhookEventTable)
      .where(eq(DodoWebhookEventTable.webhookId, webhookId))
      .limit(1);
    return { claimed: false, claimToken: null, existing: existing ?? null };
  },

  markWebhookProcessed: async (webhookId, claimToken, error) => {
    const [row] = await db
      .update(DodoWebhookEventTable)
      .set({
        processedAt: error ? null : new Date(),
        lastError: error?.slice(0, 2_000) ?? null,
        claimToken: null,
        claimExpiresAt: null,
      })
      .where(
        and(
          eq(DodoWebhookEventTable.webhookId, webhookId),
          eq(DodoWebhookEventTable.claimToken, claimToken),
          isNull(DodoWebhookEventTable.processedAt),
        ),
      )
      .returning({ webhookId: DodoWebhookEventTable.webhookId });
    return Boolean(row);
  },
};

export const dodoPaymentsRepository = pgDodoPaymentsRepository;
