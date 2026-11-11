"use client";

import type { SubscriptionTierName } from "app-types/subscription";
import { fetcher } from "lib/utils";
import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

type BillingState = {
  enabled: boolean;
  tier: SubscriptionTierName;
  activeSubscription: {
    status: string;
    nextBillingDate: string | null;
    cancelAtNextBillingDate: boolean;
  } | null;
  availableTiers: Array<{
    tier: SubscriptionTierName;
    label: string;
    pricePerMonthInr: number;
    description: string;
    purchasable: boolean;
  }>;
};

export function DodoBillingCard() {
  const { data, isLoading, mutate } = useSWR<BillingState>(
    "/api/payments/dodo/subscription",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [pending, setPending] = useState<
    SubscriptionTierName | "portal" | null
  >(null);
  const checkout = useCallback(async (tier: SubscriptionTierName) => {
    setPending(tier);
    try {
      const response = await fetch("/api/payments/dodo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const result = (await response.json()) as {
        success: boolean;
        checkoutUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.success || !result.checkoutUrl) {
        toast.error(result.error ?? "Could not start checkout");
        return;
      }
      const url = new URL(result.checkoutUrl);
      if (
        url.protocol !== "https:" ||
        !url.hostname.endsWith("dodopayments.com")
      ) {
        toast.error("Payment provider returned an unsafe checkout link");
        return;
      }
      window.location.assign(url.toString());
    } catch {
      toast.error("Could not start checkout");
    } finally {
      setPending(null);
    }
  }, []);
  const portal = useCallback(async () => {
    setPending("portal");
    try {
      const response = await fetch("/api/payments/dodo/portal", {
        method: "POST",
      });
      const result = (await response.json()) as {
        success: boolean;
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.success || !result.url) {
        toast.error("Billing management is unavailable");
        return;
      }
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        !url.hostname.endsWith("dodopayments.com")
      ) {
        toast.error("Payment provider returned an unsafe portal link");
        return;
      }
      window.location.assign(url.toString());
    } catch {
      toast.error("Could not open billing management");
    } finally {
      setPending(null);
    }
  }, []);

  if (isLoading)
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading subscription…
        </CardContent>
      </Card>
    );
  if (!data)
    return (
      <Card>
        <CardContent className="py-6">
          <Button variant="outline" onClick={() => void mutate()}>
            Retry subscription details
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <Card data-testid="dodo-billing-card">
      <CardHeader>
        <CardTitle>Plan and billing</CardTitle>
        <CardDescription>
          {data.enabled
            ? `Current plan: ${data.tier}`
            : "Self-service billing is not enabled."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.activeSubscription && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              {data.activeSubscription.status}
              {data.activeSubscription.nextBillingDate
                ? ` · next billing ${new Date(data.activeSubscription.nextBillingDate).toLocaleDateString()}`
                : ""}
              {data.activeSubscription.cancelAtNextBillingDate
                ? " · cancellation scheduled"
                : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => void portal()}
            >
              {pending === "portal" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Manage billing
            </Button>
          </div>
        )}
        {data.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.availableTiers
              .filter((item) => item.tier !== "free")
              .map((item) => (
                <div key={item.tier} className="rounded-lg border p-4">
                  <div className="font-medium">{item.label}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                  <p className="mt-3 text-sm">
                    ₹{item.pricePerMonthInr.toLocaleString("en-IN")} / month
                  </p>
                  <Button
                    className="mt-3 w-full"
                    variant={item.tier === data.tier ? "outline" : "default"}
                    disabled={
                      !item.purchasable ||
                      pending !== null ||
                      item.tier === data.tier
                    }
                    onClick={() => void checkout(item.tier)}
                  >
                    {pending === item.tier ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : item.tier === data.tier ? (
                      "Current plan"
                    ) : item.purchasable ? (
                      "Choose plan"
                    ) : (
                      "Unavailable"
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
