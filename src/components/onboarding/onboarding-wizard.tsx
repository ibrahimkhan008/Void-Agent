"use client";

import type { OnboardingStep } from "app-types/user";
import { ArrowLeft, ArrowRight, Plug, RefreshCw } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { AutomationOverviewStep } from "./automation-overview-step";

type Toolkit = {
  slug: string;
  name: string;
  isConnected: boolean;
  connectedAccountId: string | null;
};
type Account = { id: string; toolkit: string; status: string };
type ToolkitPage = {
  configured: boolean;
  toolkits: Toolkit[];
  accounts: Account[];
  nextCursor: string | null;
};

const PAGE_SIZE = 30;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "The request could not be completed.");
  }
  if (!body) throw new Error("The server returned an invalid response.");
  return body;
}

export function OnboardingWizard({
  initialStep,
  onNavigate,
}: {
  initialStep: OnboardingStep;
  onNavigate?: (destination: string) => void;
}) {
  const [step, setStep] = useState<"automation_overview" | "connect_tools">(
    initialStep === "automation_overview"
      ? "automation_overview"
      : "connect_tools",
  );
  const [page, setPage] = useState<ToolkitPage | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadToolkits = useCallback(
    async (
      options: { cursor?: string; append?: boolean; search?: string } = {},
    ) => {
      const append = options.append === true;
      setError(null);
      setLoading(append ? false : true);
      setLoadingMore(append);
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      const search = (options.search ?? "").trim();
      if (search.length >= 3) params.set("search", search.slice(0, 100));
      if (options.cursor) params.set("cursor", options.cursor);
      try {
        const response = await fetch(`/api/integrations/composio?${params}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = await readJson<ToolkitPage>(response);
        setPage((previous) =>
          append && previous
            ? {
                ...result,
                toolkits: [...previous.toolkits, ...result.toolkits],
              }
            : result,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load connected apps.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (step === "connect_tools" && page === null) void loadToolkits();
  }, [loadToolkits, page, step]);

  const saveStep = async (nextStep: "connect_tools" | "done") => {
    const response = await fetch("/api/user/onboarding", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: nextStep }),
    });
    await readJson<{ success: boolean }>(response);
  };

  const complete = async (destination: "/" | "/agents" | "/workflow") => {
    setBusy("finish");
    setError(null);
    try {
      await saveStep("done");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save setup progress.",
      );
      setBusy(null);
      return;
    }
    // Cookie writing is a cache optimization; the authenticated layout falls
    // back to this saved server state if the request fails on this device.
    await fetch("/api/onboarding/complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    if (onNavigate) onNavigate(destination);
    else window.location.assign(destination);
  };

  const continueToConnections = async () => {
    setBusy("continue");
    setError(null);
    try {
      await saveStep("connect_tools");
      setStep("connect_tools");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save setup progress.",
      );
    } finally {
      setBusy(null);
    }
  };

  const connectToolkit = async (toolkit: Toolkit) => {
    setBusy(toolkit.slug);
    setError(null);
    try {
      const response = await fetch("/api/integrations/composio", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: toolkit.slug }),
      });
      const result = await readJson<{ redirectUrl: string }>(response);
      const target = new URL(result.redirectUrl);
      if (
        target.protocol !== "https:" ||
        target.username ||
        target.password ||
        target.hash
      ) {
        throw new Error("The provider returned an unsafe authorization URL.");
      }
      if (onNavigate) onNavigate(target.toString());
      else window.location.assign(target.toString());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect this app.",
      );
      setBusy(null);
    }
  };

  const disconnectToolkit = async (account: Account) => {
    const name = account.toolkit.replaceAll("_", " ");
    if (!window.confirm(`Disconnect ${name}?`)) return;
    setBusy(account.id);
    setError(null);
    try {
      const response = await fetch("/api/integrations/composio", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId: account.id }),
      });
      await readJson<{ ok: boolean }>(response);
      await loadToolkits({ search: query });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not disconnect this app.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (step === "automation_overview") {
    return (
      <AutomationOverviewStep
        onContinue={() => void continueToConnections()}
        onSkip={() => void complete("/")}
        onChoose={(destination) => void complete(destination)}
      />
    );
  }

  const connectedAccounts = page?.accounts ?? [];
  const connectedCount = connectedAccounts.length;

  return (
    <section className="w-full max-w-3xl" aria-labelledby="connect-apps-title">
      <div className="mb-6 flex items-start gap-3">
        <Plug className="mt-1 size-5 text-primary" aria-hidden="true" />
        <div>
          <h1 id="connect-apps-title" className="text-2xl font-semibold">
            Connect your apps
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect tools Void-Agent can use for you. You can change these later
            in Settings.
          </p>
          {connectedCount > 0 && (
            <p className="mt-2 text-sm font-medium text-primary">
              {connectedCount} connected app{connectedCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <p
          role="status"
          className="rounded-lg border p-5 text-sm text-muted-foreground"
        >
          Loading available apps…
        </p>
      ) : page?.configured === false ? (
        <p
          className="rounded-lg border p-5 text-sm text-muted-foreground"
          data-testid="onboarding-composio-unconfigured"
        >
          App connections are not configured on this server. An administrator
          can enable them with a Composio API key. You can still use Void-Agent
          without connecting apps.
        </p>
      ) : (
        <>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadToolkits({ search: query });
            }}
          >
            <Input
              aria-label="Search apps"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps"
            />
            <Button type="submit" variant="outline" disabled={loadingMore}>
              Search
            </Button>
          </form>

          {connectedAccounts.length > 0 && (
            <div className="mb-5">
              <h2 className="mb-2 text-sm font-medium">Connected apps</h2>
              <ul className="space-y-2">
                {connectedAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <span className="capitalize">
                      {account.toolkit.replaceAll("_", " ")}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy === account.id}
                      onClick={() => void disconnectToolkit(account)}
                    >
                      Disconnect
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {page?.toolkits.length ? (
            <ul className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
              {page.toolkits.map((toolkit) => (
                <li
                  key={toolkit.slug}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="min-w-0 truncate">{toolkit.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={toolkit.isConnected || busy === toolkit.slug}
                    onClick={() => void connectToolkit(toolkit)}
                  >
                    {toolkit.isConnected ? "Connected" : "Connect"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border p-5 text-sm text-muted-foreground">
              No apps found. You can finish setup and connect one later.
            </p>
          )}

          {page?.nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() =>
                  void loadToolkits({
                    cursor: page.nextCursor ?? undefined,
                    search: query,
                    append: true,
                  })
                }
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setStep("automation_overview")}
        >
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void complete("/")}
          >
            Skip for now
          </Button>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => void complete("/")}
          >
            {busy === "finish" ? (
              <RefreshCw className="mr-2 size-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 size-4" />
            )}
            Finish setup
          </Button>
        </div>
      </div>
    </section>
  );
}
