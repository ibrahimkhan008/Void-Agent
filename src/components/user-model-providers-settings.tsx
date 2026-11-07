"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  modelIds: string[];
  hasApiKey: boolean;
};

export function UserModelProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/user/providers", {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load providers");
    setProviders(body.providers ?? []);
  }, []);

  useEffect(() => {
    load().catch((cause: unknown) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load providers",
      ),
    );
  }, [load]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/user/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingProviderId ? { id: editingProviderId } : {}),
          name,
          baseUrl,
          apiKey: apiKey || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not connect provider");
      setName("");
      setBaseUrl("");
      setApiKey("");
      setEditingProviderId(null);
      setNotice(
        `${editingProviderId ? "Updated" : "Connected"}. Discovered ${body.provider.modelIds.length} model(s).`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect provider",
      );
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (provider: Provider) => {
    setEditingProviderId(provider.id);
    setName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey("");
    setError("");
    setNotice("Leave the API key blank to keep the saved encrypted key.");
  };

  const cancelEdit = () => {
    setEditingProviderId(null);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setNotice("");
    setError("");
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/user/providers?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not remove provider");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove provider",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Personal model providers</h1>
        <p className="text-sm text-muted-foreground">
          Connect a public OpenAI-compatible HTTPS endpoint. API keys are
          encrypted in your account and are never shared with other users.
          Localhost and private-network endpoints are unavailable from the
          hosted service.
        </p>
      </header>

      <form onSubmit={save} className="grid gap-4 rounded-lg border p-4">
        <h2 className="font-medium">
          {editingProviderId ? "Edit provider" : "Connect provider"}
        </h2>
        <div className="grid gap-2">
          <Label htmlFor="personal-provider-name">Name</Label>
          <Input
            id="personal-provider-name"
            value={name}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="personal-provider-url">Base URL</Label>
          <Input
            id="personal-provider-url"
            type="url"
            value={baseUrl}
            maxLength={2048}
            placeholder="https://api.example.com/v1"
            required
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="personal-provider-key">API key (optional)</Label>
          <Input
            id="personal-provider-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            maxLength={4096}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : editingProviderId
                ? "Update and rediscover models"
                : "Discover models and connect"}
          </Button>
          {editingProviderId ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={cancelEdit}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <section
        className="space-y-3"
        aria-labelledby="connected-personal-providers"
      >
        <h2 id="connected-personal-providers" className="font-medium">
          Connected providers
        </h2>
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No personal providers connected.
          </p>
        ) : (
          providers.map((provider) => (
            <article
              key={provider.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="font-medium">{provider.name}</h3>
                <p className="break-all text-xs text-muted-foreground">
                  {provider.baseUrl}
                </p>
                <p className="text-sm">
                  {provider.modelIds.length} models
                  {provider.hasApiKey ? " · API key saved" : " · no API key"}
                </p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {provider.modelIds.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => startEdit(provider)}
                  aria-label={`Edit ${provider.name}`}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => remove(provider.id)}
                  aria-label={`Remove ${provider.name}`}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
