import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { CockpitConnectionTable } from "lib/db/pg/schema.pg";
import {
  decrypt,
  encrypt,
  isEncryptionAvailable,
} from "lib/security/encryption";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";
const MAX_PAGES = 10;
const MAX_STRIPE_RESPONSE_BYTES = 2 * 1024 * 1024;
const DAY_SECONDS = 86_400;

export type StripeConnectionScope = { userId: string; teamId: string | null };

export type StripeSnapshot = {
  currency: string;
  balanceAvailable: number;
  balancePending: number;
  mrr: number;
  activeSubscriptions: number;
  payments30d: { count: number; volume: number };
  failed7d: Array<{
    id: string;
    amount: number;
    currency: string;
    created: string;
    description: string | null;
  }>;
  nextPayout: { amount: number; arrivalDate: string; status: string } | null;
  generatedAt: string;
};

type StripePrice = {
  currency: string;
  unit_amount: number | null;
  unit_amount_decimal?: string | null;
  recurring: {
    interval: "day" | "week" | "month" | "year";
    interval_count: number;
  } | null;
};
type StripeSubscription = {
  id: string;
  items?: { data?: Array<{ quantity?: number | null; price: StripePrice }> };
};
type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  created: number;
  status: string;
  paid: boolean;
  description: string | null;
};
type StripePayout = {
  amount: number;
  currency: string;
  arrival_date: number;
  status: string;
};
type StripeList<T> = { data: T[]; has_more: boolean };
type StripeBalance = {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
};

export function isRestrictedStripeKey(value: unknown): value is string {
  return (
    typeof value === "string" && /^rk_(live|test)_[A-Za-z0-9]{8,}$/.test(value)
  );
}

async function stripeGet<T>(
  key: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_VERSION,
    },
    signal: signal ?? AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) {
    // Stripe bodies can contain account details; never return/log them.
    throw new Error(
      response.status === 401 || response.status === 403
        ? "stripe_auth"
        : "stripe_unavailable",
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_STRIPE_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new Error("stripe_invalid_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_STRIPE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("stripe_invalid_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error("stripe_invalid_response");
  } finally {
    reader.releaseLock();
  }
}

async function listAll<T extends { id: string }>(
  key: string,
  path: string,
  signal: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${STRIPE_API}${path}`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    const result = await stripeGet<StripeList<T>>(
      key,
      url.pathname + url.search,
      signal,
    );
    items.push(...result.data.slice(0, 100));
    const last = result.data.at(-1);
    if (!result.has_more || !last) break;
    cursor = last.id;
  }
  return items;
}

function monthlyAmount(price: StripePrice, quantity: number): number {
  if (!price.recurring) return 0;
  const unit = price.unit_amount ?? Number(price.unit_amount_decimal ?? 0);
  if (!Number.isFinite(unit)) return 0;
  const count = Math.max(1, price.recurring.interval_count || 1);
  const interval = (unit * quantity) / count;
  switch (price.recurring.interval) {
    case "day":
      return (interval * 365) / 12;
    case "week":
      return (interval * 52) / 12;
    case "year":
      return interval / 12;
    default:
      return interval;
  }
}

export function summarizeStripe(input: {
  balance: StripeBalance;
  subscriptions: StripeSubscription[];
  charges: StripeCharge[];
  payouts: StripePayout[];
  nowSeconds: number;
}): StripeSnapshot {
  const currency =
    input.balance.available[0]?.currency ??
    input.balance.pending[0]?.currency ??
    "usd";
  const sum = (rows: Array<{ amount: number; currency: string }>) =>
    rows
      .filter((r) => r.currency === currency)
      .reduce((total, row) => total + row.amount, 0);
  let mrr = 0;
  for (const sub of input.subscriptions) {
    for (const item of sub.items?.data ?? []) {
      if (item.price?.currency === currency)
        mrr += monthlyAmount(item.price, item.quantity ?? 1);
    }
  }
  const successful = input.charges.filter(
    (c) =>
      c.created >= input.nowSeconds - 30 * DAY_SECONDS &&
      c.status === "succeeded" &&
      c.paid &&
      c.currency === currency,
  );
  const failed = input.charges
    .filter(
      (c) =>
        c.created >= input.nowSeconds - 7 * DAY_SECONDS &&
        c.status === "failed",
    )
    .sort((a, b) => b.created - a.created);
  const payout =
    input.payouts.find(
      (p) => p.status === "pending" || p.status === "in_transit",
    ) ??
    input.payouts[0] ??
    null;
  return {
    currency,
    balanceAvailable: sum(input.balance.available),
    balancePending: sum(input.balance.pending),
    mrr: Math.round(mrr),
    activeSubscriptions: input.subscriptions.length,
    payments30d: {
      count: successful.length,
      volume: successful.reduce(
        (total, c) => total + c.amount - c.amount_refunded,
        0,
      ),
    },
    failed7d: failed.slice(0, 20).map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      created: new Date(c.created * 1000).toISOString(),
      description: c.description?.slice(0, 120) ?? null,
    })),
    nextPayout: payout
      ? {
          amount: payout.amount,
          arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
          status: payout.status,
        }
      : null,
    generatedAt: new Date(input.nowSeconds * 1000).toISOString(),
  };
}

export async function probeStripe(key: string): Promise<void> {
  await stripeGet<StripeBalance>(key, "/balance");
}

export async function getStripeSnapshot(
  key: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StripeSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const [balance, subscriptions, charges, payouts] = await Promise.all([
      stripeGet<StripeBalance>(key, "/balance", controller.signal),
      listAll<StripeSubscription>(
        key,
        "/subscriptions?status=active",
        controller.signal,
      ),
      listAll<StripeCharge>(
        key,
        `/charges?created[gte]=${nowSeconds - 30 * DAY_SECONDS}`,
        controller.signal,
      ),
      stripeGet<StripeList<StripePayout>>(
        key,
        "/payouts?limit=3",
        controller.signal,
      ),
    ]);
    return summarizeStripe({
      balance,
      subscriptions,
      charges,
      payouts: payouts.data.slice(0, 3),
      nowSeconds,
    });
  } finally {
    clearTimeout(timer);
  }
}

const scopeFilter = (scope: StripeConnectionScope) =>
  scope.teamId
    ? eq(CockpitConnectionTable.teamId, scope.teamId)
    : and(
        eq(CockpitConnectionTable.userId, scope.userId),
        isNull(CockpitConnectionTable.teamId),
      );

function decryptStripeKey(encrypted: string | null): string {
  if (!encrypted) throw new Error("stripe_key_unavailable");
  return decrypt(encrypted);
}

export async function getConnectionStatus(scope: StripeConnectionScope) {
  const [row] = await pgDb
    .select({
      lastTestedAt: CockpitConnectionTable.lastTestedAt,
      lastTestOk: CockpitConnectionTable.lastTestOk,
      updatedAt: CockpitConnectionTable.updatedAt,
    })
    .from(CockpitConnectionTable)
    .where(
      and(scopeFilter(scope), eq(CockpitConnectionTable.provider, "stripe")),
    )
    .limit(1);
  return row
    ? {
        connected: true,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastTestOk: row.lastTestOk,
        updatedAt: row.updatedAt.toISOString(),
      }
    : {
        connected: false,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: null,
      };
}

export async function saveStripeConnection(
  scope: StripeConnectionScope,
  key: string,
) {
  if (!isEncryptionAvailable()) throw new Error("encryption_unavailable");
  const secretEncrypted = encrypt(key);
  const conflict = scope.teamId
    ? {
        target: [
          CockpitConnectionTable.teamId,
          CockpitConnectionTable.provider,
        ],
        targetWhere: isNotNull(CockpitConnectionTable.teamId),
      }
    : {
        target: [
          CockpitConnectionTable.userId,
          CockpitConnectionTable.provider,
        ],
        targetWhere: isNull(CockpitConnectionTable.teamId),
      };
  await pgDb
    .insert(CockpitConnectionTable)
    .values({
      userId: scope.userId,
      teamId: scope.teamId,
      provider: "stripe",
      secretEncrypted,
    })
    .onConflictDoUpdate({
      ...conflict,
      set: {
        userId: scope.userId,
        secretEncrypted,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: new Date(),
      },
    });
  return getConnectionStatus(scope);
}

export async function testStoredStripeConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const [row] = await pgDb
    .select({
      id: CockpitConnectionTable.id,
      secretEncrypted: CockpitConnectionTable.secretEncrypted,
    })
    .from(CockpitConnectionTable)
    .where(
      and(scopeFilter(scope), eq(CockpitConnectionTable.provider, "stripe")),
    )
    .limit(1);
  if (!row) return false;
  let ok = false;
  try {
    await probeStripe(decryptStripeKey(row.secretEncrypted));
    ok = true;
  } catch {
    ok = false;
  }
  await pgDb
    .update(CockpitConnectionTable)
    .set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() })
    .where(and(eq(CockpitConnectionTable.id, row.id), scopeFilter(scope)));
  return ok;
}

export async function removeStripeConnection(
  scope: StripeConnectionScope,
): Promise<boolean> {
  const rows = await pgDb
    .delete(CockpitConnectionTable)
    .where(
      and(scopeFilter(scope), eq(CockpitConnectionTable.provider, "stripe")),
    )
    .returning({ id: CockpitConnectionTable.id });
  return rows.length > 0;
}

export async function loadStripeSnapshot(
  scope: StripeConnectionScope,
): Promise<StripeSnapshot | null> {
  const [row] = await pgDb
    .select({ secretEncrypted: CockpitConnectionTable.secretEncrypted })
    .from(CockpitConnectionTable)
    .where(
      and(scopeFilter(scope), eq(CockpitConnectionTable.provider, "stripe")),
    )
    .limit(1);
  if (!row) return null;
  return getStripeSnapshot(decryptStripeKey(row.secretEncrypted));
}
