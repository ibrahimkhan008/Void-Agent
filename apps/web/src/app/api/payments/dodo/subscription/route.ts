import "server-only";

import {
  type SubscriptionTierName,
  isFreeTier,
  normalizeSubscriptionTier,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { getSession } from "auth/server";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import {
  getDodoProductIdForTier,
  isDodoPaymentsEnabled,
} from "lib/payments/dodo";
import { PAID_TIER_DODO_PRODUCT_ID_ENV } from "lib/payments/dodo-config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session?.user.id)
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const user = await userRepository.getUserById(session.user.id);
  if (!user)
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  const subscriptions = await dodoPaymentsRepository.listSubscriptionsForUser(
    session.user.id,
  );
  const active =
    subscriptions.find((sub) => sub.status === "active") ??
    subscriptions[0] ??
    null;
  const availableTiers = await Promise.all(
    Object.entries(subscriptionTiersInfo).map(async ([tier, info]) => {
      const productId =
        tier === "free" ? null : await getDodoProductIdForTier(tier);
      return {
        tier: tier as SubscriptionTierName,
        label: info.label,
        pricePerMonthInr: info.pricePerMonthInr,
        description: info.description,
        purchasable:
          Boolean(productId) && tier in PAID_TIER_DODO_PRODUCT_ID_ENV,
      };
    }),
  );
  return NextResponse.json(
    {
      enabled: await isDodoPaymentsEnabled(),
      tier: normalizeSubscriptionTier(user.tier),
      isFreeTier: isFreeTier(user.tier),
      activeSubscription: active
        ? {
            status: active.status,
            previousBillingDate:
              active.previousBillingDate?.toISOString() ?? null,
            nextBillingDate: active.nextBillingDate?.toISOString() ?? null,
            cancelAtNextBillingDate: active.cancelAtNextBillingDate,
            cancelledAt: active.cancelledAt?.toISOString() ?? null,
          }
        : null,
      availableTiers,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
