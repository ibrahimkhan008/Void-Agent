"use client";

import {
  formatEuroRateMicros,
  hasDuplicatePricingModelKey,
  isValidPricingModelKey,
  parseEuroRateMicros,
} from "lib/admin/team-budget-pricing-form";
import { AlertCircleIcon, CheckCircle2Icon, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import React from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Switch } from "ui/switch";

interface PricingDraft {
  input: string;
  output: string;
}

interface ModelPrice {
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  currency: string;
}

type PricingDrafts = Record<string, PricingDraft>;

const draftsFromPricing = (
  pricing: Record<string, ModelPrice>,
): PricingDrafts =>
  Object.fromEntries(
    Object.entries(pricing).map(([key, price]) => [
      key,
      {
        input: formatEuroRateMicros(price.inputMicrosPerMillion),
        output: formatEuroRateMicros(price.outputMicrosPerMillion),
      },
    ]),
  );

export function TeamMemberBudgetSettings() {
  const [enabled, setEnabled] = useState(false);
  const [drafts, setDrafts] = useState<PricingDrafts>({});
  const [newModelKey, setNewModelKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/config")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success || !data.config?.models) {
          throw new Error(data.error ?? "Could not load budget settings");
        }
        if (!active) return;
        const models = data.config.models;
        setEnabled(models.teamMemberBudgetsEnabled === true);
        setDrafts(draftsFromPricing(models.modelPricing ?? {}));
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load budget settings",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const validationError = useMemo(() => {
    const keys = Object.keys(drafts);
    if (enabled && keys.length === 0) {
      return "Add at least one model price before enabling team budgets.";
    }
    for (const [key, draft] of Object.entries(drafts)) {
      if (!isValidPricingModelKey(key)) {
        return `Invalid model key: ${key || "(empty)"}. Use provider/model.`;
      }
      if (
        parseEuroRateMicros(draft.input) === undefined ||
        parseEuroRateMicros(draft.output) === undefined
      ) {
        return `Enter valid input and output prices for ${key}.`;
      }
      if (
        hasDuplicatePricingModelKey(
          key,
          keys.filter((item) => item !== key),
        )
      ) {
        return `Duplicate model price: ${key}.`;
      }
    }
    return "";
  }, [drafts, enabled]);

  const addPricingRow = () => {
    const key = newModelKey.trim();
    if (!isValidPricingModelKey(key)) {
      setError("Use a model key in provider/model format.");
      return;
    }
    if (hasDuplicatePricingModelKey(key, Object.keys(drafts))) {
      setError("A price for that model already exists.");
      return;
    }
    setError("");
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [key]: { input: "", output: "" },
    }));
    setNewModelKey("");
  };

  const updateRate = (
    key: string,
    field: keyof PricingDraft,
    value: string,
  ) => {
    setError("");
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [key]: { ...previous[key], [field]: value },
    }));
  };

  const removePricingRow = (key: string) => {
    setSaved(false);
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const save = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    const modelPricing = Object.fromEntries(
      Object.entries(drafts).map(([key, draft]) => [
        key,
        {
          inputMicrosPerMillion: parseEuroRateMicros(draft.input),
          outputMicrosPerMillion: parseEuroRateMicros(draft.output),
          currency: "EUR",
        },
      ]),
    );
    try {
      const response = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "models",
          settings: {
            modelPricing,
            teamMemberBudgetsEnabled: enabled,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Could not save budget settings");
      }
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save budget settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8 rounded-xl border bg-card p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Team member AI budgets</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Set trusted EUR input/output rates per million tokens and explicitly
            opt in to monthly team-member caps. Unpriced models are blocked for
            capped members after rollout is enabled. Existing chats are not
            affected while this switch is off.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
          <Switch
            checked={enabled}
            disabled={loading || saving}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              setSaved(false);
            }}
            aria-label="Enable team member monthly AI budget enforcement"
          />
        </div>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            Configure accurate provider prices before enabling enforcement. Team
            members have a default EUR 15 monthly hard cap; owners are uncapped.
            A capped member cannot use a model without a configured price.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Loading budget settings…
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.7fr)_minmax(9rem,0.7fr)_auto] gap-3 text-xs font-medium text-muted-foreground">
              <span>Provider/model</span>
              <span>Input EUR / 1M tokens</span>
              <span>Output EUR / 1M tokens</span>
              <span className="sr-only">Actions</span>
            </div>
            {Object.entries(drafts).map(([key, draft]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.7fr)_minmax(9rem,0.7fr)_auto] items-center gap-3"
              >
                <code className="truncate text-sm" title={key}>
                  {key}
                </code>
                <Input
                  inputMode="decimal"
                  aria-label={`${key} input EUR per million tokens`}
                  value={draft.input}
                  onChange={(event) =>
                    updateRate(key, "input", event.target.value)
                  }
                />
                <Input
                  inputMode="decimal"
                  aria-label={`${key} output EUR per million tokens`}
                  value={draft.output}
                  onChange={(event) =>
                    updateRate(key, "output", event.target.value)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${key} model price`}
                  onClick={() => removePricingRow(key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {Object.keys(drafts).length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">
                No model prices are configured. No provider rates are assumed.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="min-w-64 flex-1">
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="team-budget-model-key"
              >
                Add a model price
              </label>
              <Input
                id="team-budget-model-key"
                value={newModelKey}
                onChange={(event) => setNewModelKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPricingRow();
                  }
                }}
                placeholder="provider/model"
                maxLength={300}
              />
            </div>
            <Button type="button" variant="outline" onClick={addPricingRow}>
              <Plus className="mr-1.5 size-4" /> Add model
            </Button>
          </div>
        </>
      )}

      {validationError && !loading && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {validationError}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2Icon className="size-4" /> Saved
          </span>
        )}
        <Button
          type="button"
          onClick={save}
          disabled={loading || saving || Boolean(validationError)}
        >
          {saving ? "Saving..." : "Save budget settings"}
        </Button>
      </div>
    </section>
  );
}
