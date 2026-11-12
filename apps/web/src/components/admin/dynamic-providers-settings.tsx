"use client";

import { Eyebrow } from "@/components/ui/eyebrow";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";

type DynamicProvider = {
  id: string;
  name: string;
  baseURL: string;
  apiKeyConfigured: boolean;
  models: string[];
  enabled: boolean;
  addedAt: string;
};

type ProviderDraft = {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: string;
  enabled: boolean;
};

const emptyDraft: ProviderDraft = {
  id: "",
  name: "",
  baseURL: "",
  apiKey: "",
  models: "",
  enabled: true,
};

export function DynamicProvidersSettings() {
  const [providers, setProviders] = useState<DynamicProvider[]>([]);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadProviders = useCallback(async () => {
    const response = await fetch("/api/admin/providers", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(result.error || "Could not load providers");
    setProviders(result.providers);
  }, []);

  useEffect(() => {
    void loadProviders().catch((error: unknown) =>
      setStatus(
        error instanceof Error ? error.message : "Could not load providers",
      ),
    );
  }, [loadProviders]);

  function edit(provider: DynamicProvider) {
    setEditingId(provider.id);
    setDraft({
      id: provider.id,
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey: "",
      models: provider.models.join("\n"),
      enabled: provider.enabled,
    });
    setStatus(
      provider.apiKeyConfigured
        ? "Leave API key blank to keep the saved key."
        : "No API key is currently configured.",
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          models: draft.models
            .split("\n")
            .map((model) => model.trim())
            .filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Could not save provider");
      await loadProviders();
      setDraft(emptyDraft);
      setEditingId(null);
      setStatus("Provider saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save provider",
      );
    } finally {
      setBusy(false);
    }
  }

  async function discoverModels() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/providers/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseURL: draft.baseURL,
          providerId: editingId ?? undefined,
          apiKey: draft.apiKey || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Model discovery failed");
      setDraft((current) => ({ ...current, models: result.models.join("\n") }));
      setStatus(`Discovered ${result.models.length} models.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Model discovery failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function testProvider(providerId: string) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      const result = await response.json();
      setStatus(
        result.success
          ? `Connection succeeded in ${result.latencyMs} ms.`
          : result.error || "Provider connection failed.",
      );
    } catch {
      setStatus("Provider connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProvider(providerId: string) {
    if (!window.confirm(`Delete provider ${providerId}?`)) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/providers?id=${encodeURIComponent(providerId)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || "Could not delete provider");
      await loadProviders();
      if (editingId === providerId) {
        setEditingId(null);
        setDraft(emptyDraft);
      }
      setStatus("Provider deleted.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not delete provider",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header>
        <Eyebrow>Settings</Eyebrow>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
          Dynamic model providers
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure OpenAI-compatible providers. API keys are encrypted
          server-side and never shown after saving.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Configured providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No dynamic providers configured.
            </p>
          )}
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {provider.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({provider.id})
                  </span>
                </div>
                <div className="break-all text-sm text-muted-foreground">
                  {provider.baseURL}
                </div>
                <div className="text-xs text-muted-foreground">
                  {provider.models.length} models ·{" "}
                  {provider.apiKeyConfigured
                    ? "API key configured"
                    : "No API key"}{" "}
                  · {provider.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void testProvider(provider.id)}
                >
                  Test
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => edit(provider)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void removeProvider(provider.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? `Edit ${editingId}` : "Add provider"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={save}>
            <label className="grid gap-1 text-sm">
              Provider name
              <Input
                required
                maxLength={100}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Provider ID (optional)
              <Input
                maxLength={64}
                value={draft.id}
                disabled={Boolean(editingId)}
                placeholder="generated-from-name"
                onChange={(event) =>
                  setDraft({ ...draft, id: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Base URL
              <Input
                required
                type="url"
                maxLength={2048}
                placeholder="https://api.example.com/v1"
                value={draft.baseURL}
                onChange={(event) =>
                  setDraft({ ...draft, baseURL: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              API key
              <Input
                type="password"
                autoComplete="new-password"
                maxLength={4096}
                value={draft.apiKey}
                placeholder={
                  editingId ? "Leave blank to retain current key" : "Optional"
                }
                onChange={(event) =>
                  setDraft({ ...draft, apiKey: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Models, one model ID per line
              <textarea
                className="min-h-28 rounded-md border bg-transparent p-3 font-mono text-sm"
                value={draft.models}
                onChange={(event) =>
                  setDraft({ ...draft, models: event.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
              />{" "}
              Enabled for model selection
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || !draft.baseURL}
                onClick={() => void discoverModels()}
              >
                Discover models
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : "Save provider"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(null);
                    setDraft(emptyDraft);
                    setStatus("");
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
