"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React, { useCallback, useEffect, useState } from "react";

type Toolkit = {
  slug: string;
  name: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId: string | null;
};
type Account = {
  id: string;
  toolkit: string;
  status: string;
  accountType?: "PRIVATE" | "SHARED";
};
type Payload = {
  configured: boolean;
  toolkits: Toolkit[];
  accounts: Account[];
  error?: string;
};

export function ComposioAppConnections() {
  const [search, setSearch] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term = "") => {
    const params = new URLSearchParams({ limit: "30" });
    if (term.trim().length >= 3) params.set("search", term.trim());
    const response = await fetch(`/api/integrations/composio?${params}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as Payload;
    if (!response.ok)
      throw new Error(data.error ?? "Could not load connected apps");
    setPayload(data);
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load connected apps",
      ),
    );
  }, [load]);

  const connect = async (toolkit: string) => {
    setBusy(toolkit);
    setError(null);
    try {
      const response = await fetch("/api/integrations/composio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await response.json()) as {
        redirectUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.redirectUrl)
        throw new Error(data.error ?? "Could not start app authorization");
      const target = new URL(data.redirectUrl);
      if (target.protocol !== "https:")
        throw new Error("Provider returned an unsafe authorization URL");
      window.location.assign(target.toString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start app authorization",
      );
      setBusy(null);
    }
  };

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.toolkit.replaceAll("_", " ")}?`))
      return;
    setBusy(account.id);
    setError(null);
    try {
      const response = await fetch("/api/integrations/composio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId: account.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not disconnect app");
      await load(search);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect app",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="rounded-lg border p-4"
      aria-labelledby="composio-app-connections-title"
    >
      <h2 id="composio-app-connections-title" className="text-lg font-semibold">
        Connected apps
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect apps through Composio OAuth. Accounts available to your Composio
        user are listed below.
      </p>
      {!payload?.configured ? (
        <p className="mt-3 text-sm text-muted-foreground">
          App connections are not configured on this server.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label="Search apps"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  void load(search).catch(() =>
                    setError("Could not search apps"),
                  );
              }}
              placeholder="Search apps"
            />
            <Button
              variant="outline"
              onClick={() =>
                void load(search).catch(() => setError("Could not search apps"))
              }
            >
              Search
            </Button>
          </div>
          {payload.accounts.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label="Connected accounts">
              {payload.accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded border p-2 text-sm"
                >
                  <span className="capitalize">
                    {account.toolkit.replaceAll("_", " ")}
                    {account.accountType === "SHARED" && (
                      <span className="ml-2 text-muted-foreground">Shared</span>
                    )}
                  </span>
                  {account.accountType !== "SHARED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === account.id}
                      onClick={() => void disconnect(account)}
                    >
                      Disconnect
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {payload.toolkits.length > 0 && (
            <ul
              className="mt-4 grid gap-2 sm:grid-cols-2"
              aria-label="Available apps"
            >
              {payload.toolkits.map((toolkit) => (
                <li
                  key={toolkit.slug}
                  className="flex items-center justify-between gap-3 rounded border p-2 text-sm"
                >
                  <span>{toolkit.name}</span>
                  <Button
                    size="sm"
                    disabled={toolkit.isConnected || busy === toolkit.slug}
                    onClick={() => void connect(toolkit.slug)}
                  >
                    {toolkit.isConnected ? "Connected" : "Connect"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
