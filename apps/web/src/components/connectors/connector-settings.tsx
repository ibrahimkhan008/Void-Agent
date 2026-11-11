"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Connector = {
  provider: string;
  name: string;
  authMode: string;
  connectionFlow: string;
  isConnected: boolean;
  isPaused: boolean;
  account?: string;
  accountName?: string;
};

const AUTH_HOSTS = new Set([
  "accounts.google.com",
  "login.microsoftonline.com",
  "slack.com",
  "api.notion.com",
  "github.com",
  "auth.atlassian.com",
  "app.productboard.com",
]);

export function ConnectorSettings() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [freshdeskApiKey, setFreshdeskApiKey] = useState("");
  const [zulipRealmUrl, setZulipRealmUrl] = useState("");
  const [zulipEmail, setZulipEmail] = useState("");
  const [zulipApiKey, setZulipApiKey] = useState("");
  const popupRef = useRef<Window | null>(null);
  const popupProviderRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/connectors", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load connected accounts");
      const body = await response.json();
      setConnectors(Array.isArray(body.connectors) ? body.connectors : []);
    } catch {
      setNotice("Could not load connector accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== popupRef.current ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      const data = event.data as { type?: unknown; provider?: unknown };
      if (
        data.type !== "CONNECTOR_OAUTH_SUCCESS" &&
        data.type !== "CONNECTOR_OAUTH_ERROR"
      )
        return;
      if (
        typeof data.provider !== "string" ||
        data.provider !== popupProviderRef.current
      )
        return;
      popupRef.current = null;
      popupProviderRef.current = null;
      setBusy(null);
      setNotice(
        data.type === "CONNECTOR_OAUTH_SUCCESS"
          ? "Connector connected."
          : "Authorization was not completed.",
      );
      void reload();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [reload]);

  const connect = async (provider: string) => {
    setBusy(provider);
    setNotice("");
    const popup = window.open(
      "about:blank",
      "void-agent-connector",
      "popup,width=620,height=760",
    );
    if (!popup) {
      setBusy(null);
      setNotice("Allow pop-ups to connect an account.");
      return;
    }
    popupRef.current = popup;
    popupProviderRef.current = provider;
    try {
      const response = await fetch(
        `/api/connectors/${encodeURIComponent(provider)}/authorize`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const body = await response.json();
      if (!response.ok || typeof body.authUrl !== "string")
        throw new Error("Connector is not configured.");
      const authUrl = new URL(body.authUrl);
      const trustedZendeskHost =
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.zendesk\.com$/.test(
          authUrl.hostname,
        );
      if (
        authUrl.protocol !== "https:" ||
        (!AUTH_HOSTS.has(authUrl.hostname) && !trustedZendeskHost)
      ) {
        throw new Error("Connector returned an untrusted authorization URL.");
      }
      popup.location.replace(authUrl.toString());
      const popupMonitor = window.setInterval(() => {
        if (!popup.closed) return;
        window.clearInterval(popupMonitor);
        if (popupRef.current === popup) {
          popupRef.current = null;
          popupProviderRef.current = null;
          setBusy(null);
        }
      }, 500);
    } catch (error) {
      popup.close();
      popupRef.current = null;
      popupProviderRef.current = null;
      setBusy(null);
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not start authorization.",
      );
    }
  };

  const disconnect = async (provider: string) => {
    setBusy(provider);
    setNotice("");
    try {
      const response = await fetch(
        `/api/connectors?provider=${encodeURIComponent(provider)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      if (!response.ok) throw new Error();
      setNotice("Connector disconnected.");
      await reload();
    } catch {
      setNotice("Could not disconnect this account. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const connectFreshdesk = async () => {
    setBusy("freshdesk");
    setNotice("");
    try {
      const response = await fetch("/api/connectors/freshdesk/credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: freshdeskApiKey }),
      });
      const body = await response.json();
      setFreshdeskApiKey("");
      if (!response.ok || body.connected !== true)
        throw new Error("Could not verify Freshdesk credentials.");
      setNotice("Freshdesk connected.");
      await reload();
    } catch (error) {
      setFreshdeskApiKey("");
      setNotice(
        error instanceof Error ? error.message : "Could not connect Freshdesk.",
      );
    } finally {
      setBusy(null);
    }
  };

  const connectZulip = async () => {
    setBusy("zulip");
    setNotice("");
    try {
      const response = await fetch("/api/connectors/zulip/credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realmUrl: zulipRealmUrl,
          email: zulipEmail,
          apiKey: zulipApiKey,
        }),
      });
      const body = await response.json();
      setZulipApiKey("");
      if (!response.ok || body.connected !== true)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Could not verify Zulip credentials.",
        );
      setNotice("Zulip connected.");
      setZulipRealmUrl("");
      setZulipEmail("");
      await reload();
    } catch (error) {
      setZulipApiKey("");
      setNotice(
        error instanceof Error ? error.message : "Could not connect Zulip.",
      );
    } finally {
      setBusy(null);
    }
  };

  const supported = connectors.filter((connector) =>
    [
      "gmail",
      "google-drive",
      "google-calendar",
      "google-docs",
      "google-forms",
      "google-keep",
      "google-meet",
      "google-sheets",
      "google-slides",
      "google-tasks",
      "youtube",
      "outlook",
      "teams",
      "slack",
      "notion",
      "github",
      "jira",
      "zendesk",
      "freshdesk",
      "productboard",
      "zulip",
    ].includes(connector.provider),
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Connected accounts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect accounts to use their data with Void-Agent. Provider
          credentials are stored encrypted and scoped to your account.
        </p>
      </header>
      {notice ? (
        <p role="status" className="rounded-md border p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {loading ? <p role="status">Loading connectors…</p> : null}
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Connectors">
        {supported.map((connector) => (
          <article
            key={connector.provider}
            className="flex items-center justify-between gap-4 rounded-lg border p-4"
          >
            <div className="min-w-0">
              <h2 className="font-medium">{connector.name}</h2>
              <p className="truncate text-sm text-muted-foreground">
                {connector.isConnected
                  ? connector.account || connector.accountName || "Connected"
                  : connector.connectionFlow === "direct-oauth"
                    ? "Ready to connect"
                    : "Configure provider credentials to enable"}
              </p>
            </div>
            {connector.isConnected ? (
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                disabled={busy === connector.provider}
                onClick={() => void disconnect(connector.provider)}
              >
                {busy === connector.provider ? "Working…" : "Disconnect"}
              </button>
            ) : connector.provider === "zulip" &&
              connector.connectionFlow === "api-key" ? (
              <div className="flex min-w-0 flex-col gap-2">
                <input
                  aria-label="Zulip realm URL"
                  type="url"
                  autoComplete="off"
                  value={zulipRealmUrl}
                  onChange={(event) => setZulipRealmUrl(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="https://chat.example.com"
                  maxLength={512}
                />
                <input
                  aria-label="Zulip email"
                  type="email"
                  autoComplete="off"
                  value={zulipEmail}
                  onChange={(event) => setZulipEmail(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Zulip account email"
                  maxLength={320}
                />
                <input
                  aria-label="Zulip API key"
                  type="password"
                  autoComplete="off"
                  value={zulipApiKey}
                  onChange={(event) => setZulipApiKey(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Zulip API key"
                  maxLength={512}
                />
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  disabled={
                    busy !== null ||
                    zulipRealmUrl.length < 8 ||
                    !zulipEmail.includes("@") ||
                    zulipApiKey.length < 16
                  }
                  onClick={() => void connectZulip()}
                >
                  {busy === "zulip" ? "Verifying…" : "Connect securely"}
                </button>
              </div>
            ) : connector.provider === "freshdesk" &&
              connector.connectionFlow === "api-key" ? (
              <div className="flex min-w-0 flex-col gap-2">
                <input
                  aria-label="Freshdesk API key"
                  type="password"
                  autoComplete="off"
                  value={freshdeskApiKey}
                  onChange={(event) => setFreshdeskApiKey(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Freshdesk API key"
                  maxLength={512}
                />
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  disabled={busy !== null || freshdeskApiKey.length < 20}
                  onClick={() => void connectFreshdesk()}
                >
                  {busy === "freshdesk" ? "Verifying…" : "Connect securely"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                disabled={
                  busy !== null || connector.connectionFlow !== "direct-oauth"
                }
                onClick={() => void connect(connector.provider)}
              >
                {busy === connector.provider ? "Opening…" : "Connect"}
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
