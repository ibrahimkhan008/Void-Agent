"use client";

import { Eyebrow } from "@/components/ui/eyebrow";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Switch } from "ui/switch";

const TIERS = [
  "flare-pro",
  "flare-max",
  "flare-enterprises",
  "flare-enterprises-pro",
  "flare-enterprises-max",
] as const;
type Tier = (typeof TIERS)[number];
type Status = {
  success: boolean;
  dodo: {
    enabled: boolean;
    environment: "test_mode" | "live_mode";
    productIds: Record<Tier, { env: string | null; configured: boolean }>;
    apiKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
};

export function DodoPaymentsSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<"test_mode" | "live_mode">(
    "test_mode",
  );
  const [products, setProducts] = useState<Partial<Record<Tier, string>>>({});
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/payments/dodo", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load Dodo settings");
        const result = (await response.json()) as Status;
        if (!active) return;
        setStatus(result);
        setEnabled(result.dodo.enabled);
        setEnvironment(result.dodo.environment);
      })
      .catch(() => {
        if (active) toast.error("Could not load Dodo settings");
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const productIds = Object.fromEntries(
        Object.entries(products).filter(([, value]) => value !== undefined),
      );
      const response = await fetch("/api/admin/payments/dodo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          environment,
          ...(Object.keys(productIds).length ? { productIds } : {}),
          ...(apiKey ? { apiKey } : {}),
          ...(webhookSecret ? { webhookSecret } : {}),
        }),
      });
      if (!response.ok) throw new Error("Could not save Dodo settings");
      setApiKey("");
      setWebhookSecret("");
      setProducts({});
      const refreshed = (await fetch("/api/admin/payments/dodo", {
        cache: "no-store",
      }).then((value) => value.json())) as Status;
      setStatus(refreshed);
      setEnabled(refreshed.dodo.enabled);
      setEnvironment(refreshed.dodo.environment);
      toast.success("Dodo settings saved");
    } catch {
      toast.error("Could not save Dodo settings");
    } finally {
      setSaving(false);
    }
  };

  if (!status)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading payment settings…
      </div>
    );
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6"
      data-testid="dodo-payments-settings"
    >
      <div>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
          Dodo Payments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional self-service billing. Autumn remains the primary organization
          billing provider.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Provider configuration</CardTitle>
          <CardDescription>
            Credentials are encrypted at rest and are never returned to this
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="dodo-enabled">Enable Dodo checkout</Label>
              <p className="text-xs text-muted-foreground">
                Checkout also requires an API key, webhook secret, and mapped
                product.
              </p>
            </div>
            <Switch
              id="dodo-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dodo-environment">Environment</Label>
              <select
                id="dodo-environment"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={environment}
                onChange={(event) =>
                  setEnvironment(
                    event.target.value as "test_mode" | "live_mode",
                  )
                }
              >
                <option value="test_mode">Test mode</option>
                <option value="live_mode">Live mode</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dodo-api-key">API key</Label>
              <Input
                id="dodo-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  status.dodo.apiKeyConfigured
                    ? "Configured; enter to replace"
                    : "Not configured"
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="dodo-webhook-secret">Webhook secret</Label>
              <Input
                id="dodo-webhook-secret"
                type="password"
                autoComplete="new-password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder={
                  status.dodo.webhookSecretConfigured
                    ? "Configured; enter to replace"
                    : "Not configured"
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Product mappings</CardTitle>
          <CardDescription>
            Only configured product identifiers are shown. Leave unchanged
            fields blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {TIERS.map((tier) => (
            <div className="space-y-2" key={tier}>
              <Label htmlFor={`dodo-${tier}`}>{tier}</Label>
              <Input
                id={`dodo-${tier}`}
                autoComplete="off"
                value={products[tier] ?? ""}
                onChange={(event) =>
                  setProducts((current) => ({
                    ...current,
                    [tier]: event.target.value,
                  }))
                }
                placeholder={
                  status.dodo.productIds[tier]?.configured ||
                  status.dodo.productIds[tier]?.env
                    ? "Configured; enter to replace"
                    : "Not configured"
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
