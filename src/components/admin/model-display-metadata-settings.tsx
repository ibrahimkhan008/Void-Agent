"use client";

import {
  AUTOMATIC_ROUTING_TASKS,
  type ModelDisplayMetadata,
  type ModelDisplayMetadataMap,
  validateModelDisplayMetadataMap,
} from "lib/ai/model-display-metadata";
import { normalizeModelKey } from "lib/ai/model-pricing";
import { Pencil, Plus, Trash2 } from "lucide-react";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Switch } from "ui/switch";

const FLAGS = [
  ["hiddenGem", "Hidden gem"],
  ["caution", "Caution"],
  ["notRecommended", "Not recommended"],
  ["cheapAlternative", "Cheaper alternative"],
  ["speed", "Fast"],
  ["thinking", "Thinking"],
  ["maxPerformance", "Max performance"],
] as const satisfies ReadonlyArray<
  readonly [keyof ModelDisplayMetadata, string]
>;

const ROUTING_TASK_LABELS = {
  general_chat: "General chat",
  coding: "Coding",
  web_development: "Web development",
  web_search: "Web search",
  document_extraction: "Document extraction",
  tool_calling: "Tool calling",
  writing: "Writing",
  reasoning: "Reasoning",
  vision: "Vision",
} as const;

type Draft = {
  provider: string;
  model: string;
  developer: string;
  country: string;
  inputPriceUsd: string;
  outputPriceUsd: string;
  automaticRoutingPriority: string;
  automaticRoutingContextTokens: string;
  automaticRoutingScores: Partial<
    Record<(typeof AUTOMATIC_ROUTING_TASKS)[number], string>
  >;
  flags: Partial<Record<(typeof FLAGS)[number][0], boolean>>;
};

const EMPTY_DRAFT: Draft = {
  provider: "",
  model: "",
  developer: "",
  country: "",
  inputPriceUsd: "",
  outputPriceUsd: "",
  automaticRoutingPriority: "",
  automaticRoutingContextTokens: "",
  automaticRoutingScores: {},
  flags: {},
};

function splitKey(key: string) {
  const separator = key.indexOf("/");
  return separator < 1
    ? { provider: "", model: "" }
    : {
        provider: key.slice(0, separator),
        model: key.slice(separator + 1),
      };
}

function makeMetadata(draft: Draft): ModelDisplayMetadata {
  return {
    ...(draft.developer.trim() ? { developer: draft.developer.trim() } : {}),
    ...(draft.country.trim() ? { country: draft.country.trim() } : {}),
    ...Object.fromEntries(
      FLAGS.map(([key]) => [key, draft.flags[key] === true]),
    ),
    ...(draft.inputPriceUsd.trim()
      ? { inputPriceUsd: Number(draft.inputPriceUsd) }
      : {}),
    ...(draft.outputPriceUsd.trim()
      ? { outputPriceUsd: Number(draft.outputPriceUsd) }
      : {}),
    ...(draft.automaticRoutingPriority.trim()
      ? { automaticRoutingPriority: Number(draft.automaticRoutingPriority) }
      : {}),
    ...(draft.automaticRoutingContextTokens.trim()
      ? {
          automaticRoutingContextTokens: Number(
            draft.automaticRoutingContextTokens,
          ),
        }
      : {}),
    ...(Object.values(draft.automaticRoutingScores).some(
      (score) => score?.trim() && Number(score) > 0,
    )
      ? {
          automaticRoutingScores: Object.fromEntries(
            Object.entries(draft.automaticRoutingScores)
              .filter(([, score]) => score?.trim())
              .map(([task, score]) => [task, Number(score)]),
          ),
        }
      : {}),
  };
}

export function ModelDisplayMetadataSettings() {
  const [metadata, setMetadata] = useState<ModelDisplayMetadataMap>({});
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingKey, setEditingKey] = useState<string | null>(null);
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
          throw new Error(
            data.error ?? "Could not load model catalog metadata",
          );
        }
        const parsed = validateModelDisplayMetadataMap(
          data.config.models.modelDisplayMetadata ?? {},
        );
        if (!parsed)
          throw new Error("Stored model catalog metadata is invalid");
        if (active) setMetadata(parsed);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load model catalog metadata",
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
    if (!draft.provider.trim() || !draft.model.trim()) {
      return "Enter both a provider ID and model name.";
    }
    const key = normalizeModelKey(draft.provider, draft.model);
    const duplicate = Object.keys(metadata).some(
      (existing) => existing === key && existing !== editingKey,
    );
    if (duplicate) return "Metadata already exists for this provider/model.";
    if (
      draft.inputPriceUsd.trim() &&
      (!Number.isFinite(Number(draft.inputPriceUsd)) ||
        Number(draft.inputPriceUsd) < 0 ||
        Number(draft.inputPriceUsd) > 100_000)
    ) {
      return "Enter a valid input USD price per million tokens (0 to 100000).";
    }
    if (
      draft.outputPriceUsd.trim() &&
      (!Number.isFinite(Number(draft.outputPriceUsd)) ||
        Number(draft.outputPriceUsd) < 0 ||
        Number(draft.outputPriceUsd) > 100_000)
    ) {
      return "Enter a valid output USD price per million tokens (0 to 100000).";
    }
    if (draft.country.trim() && !/^[a-z]{2}$/i.test(draft.country.trim())) {
      return "Country must be a two-letter ISO code.";
    }
    if (
      draft.automaticRoutingPriority.trim() &&
      (!Number.isInteger(Number(draft.automaticRoutingPriority)) ||
        Number(draft.automaticRoutingPriority) < 0 ||
        Number(draft.automaticRoutingPriority) > 1000)
    ) {
      return "Routing priority must be an integer from 0 to 1000 (lower runs first).";
    }
    if (
      draft.automaticRoutingContextTokens.trim() &&
      (!Number.isInteger(Number(draft.automaticRoutingContextTokens)) ||
        Number(draft.automaticRoutingContextTokens) < 1 ||
        Number(draft.automaticRoutingContextTokens) > 2_000_000)
    ) {
      return "Verified context size must be a whole number from 1 to 2000000 tokens.";
    }
    const routingScores = Object.values(draft.automaticRoutingScores).filter(
      (score) => score?.trim(),
    );
    if (
      routingScores.some(
        (score) =>
          !Number.isInteger(Number(score)) ||
          Number(score) < 0 ||
          Number(score) > 100,
      )
    ) {
      return "Routing scores must be whole numbers from 0 to 100.";
    }
    if (
      routingScores.length > 0 &&
      !routingScores.some((score) => Number(score) > 0)
    ) {
      return "Set at least one routing score above 0 to include this model in Auto.";
    }
    return "";
  }, [draft, editingKey, metadata]);

  const addOrUpdate = () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    const key = normalizeModelKey(draft.provider, draft.model);
    const next = { ...metadata };
    if (editingKey && editingKey !== key) delete next[editingKey];
    next[key] = makeMetadata(draft);
    const parsed = validateModelDisplayMetadataMap(next);
    if (!parsed) {
      setError("The metadata entry is invalid.");
      return;
    }
    setMetadata(parsed);
    setDraft(EMPTY_DRAFT);
    setEditingKey(null);
    setError("");
    setSaved(false);
  };

  const edit = (key: string, value: ModelDisplayMetadata) => {
    const { provider, model } = splitKey(key);
    setEditingKey(key);
    setDraft({
      provider,
      model,
      developer: value.developer ?? "",
      country: value.country ?? "",
      inputPriceUsd: value.inputPriceUsd?.toString() ?? "",
      outputPriceUsd: value.outputPriceUsd?.toString() ?? "",
      automaticRoutingPriority:
        value.automaticRoutingPriority?.toString() ?? "",
      automaticRoutingContextTokens:
        value.automaticRoutingContextTokens?.toString() ?? "",
      automaticRoutingScores: Object.fromEntries(
        AUTOMATIC_ROUTING_TASKS.filter(
          (task) => value.automaticRoutingScores?.[task] !== undefined,
        ).map((task) => [task, String(value.automaticRoutingScores?.[task])]),
      ),
      flags: Object.fromEntries(
        FLAGS.map(([flag]) => [flag, value[flag] === true]),
      ),
    });
    setError("");
    setSaved(false);
  };

  const save = async () => {
    const parsed = validateModelDisplayMetadataMap(metadata);
    if (!parsed) {
      setError("The model metadata list is invalid.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "models",
          settings: { modelDisplayMetadata: parsed },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Could not save model catalog metadata");
      }
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save model catalog metadata",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8 space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Model catalog metadata</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Curate public badges and catalog prices for the model picker. Prices
            are display-only USD per million tokens and never affect the
            separate EUR team budget policy. Personal Auto routing uses only
            enabled deployment providers with admin-entered task scores and
            catalog-backed tool/vision metadata. For a model outside the static
            context catalog, enter a context size verified with its provider.
          </p>
        </div>
        <Button onClick={save} disabled={loading || saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save catalog metadata"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading metadata…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-medium">
              Provider ID
              <Input
                value={draft.provider}
                maxLength={100}
                placeholder="openai"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    provider: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Model name
              <Input
                value={draft.model}
                maxLength={350}
                placeholder="gpt-4.1"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    model: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Developer
              <Input
                value={draft.developer}
                maxLength={100}
                placeholder="OpenAI"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    developer: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Country code
              <Input
                value={draft.country}
                maxLength={2}
                placeholder="US"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    country: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Input USD / million tokens
              <Input
                type="number"
                min="0"
                max="100000"
                step="any"
                value={draft.inputPriceUsd}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    inputPriceUsd: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Output USD / million tokens
              <Input
                type="number"
                min="0"
                max="100000"
                step="any"
                value={draft.outputPriceUsd}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    outputPriceUsd: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Automatic routing priority (lower first)
              <Input
                type="number"
                min="0"
                max="1000"
                step="1"
                value={draft.automaticRoutingPriority}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    automaticRoutingPriority: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Admin-verified context tokens
              <Input
                type="number"
                min="1"
                max="2000000"
                step="1"
                value={draft.automaticRoutingContextTokens}
                aria-label="Admin-verified context tokens"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    automaticRoutingContextTokens: event.target.value,
                  }))
                }
              />
              <span className="block font-normal text-muted-foreground">
                Use a provider-documented or provider-verified limit. Built-in
                catalog values take precedence.
              </span>
            </label>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Personal Auto task scores
            </legend>
            <p className="text-xs text-muted-foreground">
              Scores are explicit admin rankings (0-100). A model is considered
              only when it has at least one positive score and its provider is
              enabled with a configured deployment key.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AUTOMATIC_ROUTING_TASKS.map((task) => (
                <label key={task} className="space-y-1 text-xs font-medium">
                  {ROUTING_TASK_LABELS[task]}
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={draft.automaticRoutingScores[task] ?? ""}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        automaticRoutingScores: {
                          ...previous.automaticRoutingScores,
                          [task]: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {FLAGS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.flags[key] === true}
                  onCheckedChange={(checked) =>
                    setDraft((previous) => ({
                      ...previous,
                      flags: { ...previous.flags, [key]: checked },
                    }))
                  }
                  aria-label={label}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={addOrUpdate}
              disabled={!draft.provider.trim() || !draft.model.trim()}
            >
              {editingKey ? (
                <Pencil className="mr-1.5 size-4" />
              ) : (
                <Plus className="mr-1.5 size-4" />
              )}
              {editingKey ? "Update entry" : "Add entry"}
            </Button>
            {editingKey && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setEditingKey(null);
                }}
              >
                Cancel edit
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {Object.keys(metadata).length}/1000 entries
            </span>
          </div>

          {Object.entries(metadata).length > 0 && (
            <ul className="space-y-2">
              {Object.entries(metadata).map(([key, value]) => (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{key}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        value.developer,
                        value.country,
                        value.inputPriceUsd !== undefined
                          ? `In $${value.inputPriceUsd}`
                          : undefined,
                        value.outputPriceUsd !== undefined
                          ? `Out $${value.outputPriceUsd}`
                          : undefined,
                        value.automaticRoutingContextTokens !== undefined
                          ? `Context ${value.automaticRoutingContextTokens.toLocaleString()}`
                          : undefined,
                        value.automaticRoutingScores
                          ? `Auto: ${Object.entries(
                              value.automaticRoutingScores,
                            )
                              .filter(([, score]) => score > 0)
                              .map(([task, score]) => `${task} ${score}`)
                              .join(", ")}`
                          : undefined,
                        ...FLAGS.filter(([flag]) => value[flag]).map(
                          ([, label]) => label,
                        ),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No display metadata"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => edit(key, value)}
                      aria-label={`Edit ${key}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMetadata((previous) => {
                          const next = { ...previous };
                          delete next[key];
                          return next;
                        });
                        if (editingKey === key) {
                          setEditingKey(null);
                          setDraft(EMPTY_DRAFT);
                        }
                        setSaved(false);
                      }}
                      aria-label={`Remove ${key}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
