"use client";
import { Eyebrow } from "@/components/ui/eyebrow";

import { VoiceCaptureSummaryPanel } from "@/components/voice-capture-summary-panel";
import {
  AudioLines,
  Copy,
  History,
  KeyRound,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";

type VoiceDevice = {
  id: string;
  deviceType: string;
  displayName: string;
  status: string;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};
type DeviceTranscript = {
  id: string;
  threadId: string;
  text: string;
  language: string | null;
  createdAt: string;
};
type DeviceSession = {
  id: string;
  sessionId: string;
  status: string;
  segmentCount: number;
  startedAt: string;
  finalizedAt: string | null;
  transcript: string;
  threadId: string | null;
  messageId: string | null;
};
type SessionSegment = {
  eventId: string;
  sequenceNumber: number;
  text: string;
  language: string | null;
  createdAt: string;
};

export function VoiceDevicesDashboard() {
  const [devices, setDevices] = useState<VoiceDevice[]>([]);
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotatingDeviceId, setRotatingDeviceId] = useState<string | null>(null);
  const [rotatedCredential, setRotatedCredential] = useState<{
    deviceId: string;
    displayName: string;
    token: string;
  } | null>(null);
  const [credentialError, setCredentialError] = useState<{
    deviceId: string;
    message: string;
  } | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [activationMessage, setActivationMessage] = useState<string | null>(
    null,
  );
  const [claimedRegistration, setClaimedRegistration] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const [history, setHistory] = useState<
    Record<
      string,
      {
        items: DeviceTranscript[];
        sessions: DeviceSession[];
        sessionsNextCursor: string | null;
        sessionsLoadingMore?: boolean;
        sessionsError?: string;
        error?: string;
      }
    >
  >({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [segmentDetails, setSegmentDetails] = useState<
    Record<
      string,
      {
        items: SessionSegment[];
        truncated: boolean;
        error?: string;
        loading?: boolean;
      }
    >
  >({});
  const [segmentsOpen, setSegmentsOpen] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const response = await fetch("/api/voice/devices", { cache: "no-store" });
    if (response.ok) setDevices((await response.json()).devices ?? []);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!claimedRegistration || claimedRegistration.status !== "claimed")
      return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/voice/devices/registrations/status?registrationId=${encodeURIComponent(claimedRegistration.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const status = await response.json();
        if (!active) return;
        if (status.status === "completed") {
          setClaimedRegistration({
            id: status.registrationId,
            status: "completed",
          });
          setActivationMessage(
            "Device credential received. The device is linked to your account.",
          );
          void refresh();
        } else if (status.status === "expired") {
          setClaimedRegistration({
            id: status.registrationId,
            status: "expired",
          });
          setActivationMessage(
            "Activation expired. Restart device setup to get a new code.",
          );
        }
      } catch {
        // Retry temporary status errors on the next poll.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [claimedRegistration, refresh]);

  const createCode = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/voice/devices/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceType: "m5stack_atom_echo_s3r",
          displayName: "Void Agent Voice Device",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not create a pairing code.");
      setPairing({ code: result.code, expiresAt: result.expiresAt });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not create a pairing code.",
      );
    } finally {
      setBusy(false);
    }
  };

  const claimActivation = async () => {
    setBusy(true);
    setActivationMessage(null);
    try {
      const response = await fetch("/api/voice/devices/registrations/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activationCode }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not claim device activation.");
      setActivationCode("");
      setClaimedRegistration({ id: result.registrationId, status: "claimed" });
      setActivationMessage(
        "Device claimed. Keep it powered on and connected while it securely retrieves its credential.",
      );
      await refresh();
    } catch (error) {
      setActivationMessage(
        error instanceof Error
          ? error.message
          : "Could not claim device activation.",
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const response = await fetch("/api/voice/devices/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    });
    if (response.ok) {
      setRotatedCredential((credential) =>
        credential?.deviceId === id ? null : credential,
      );
      await refresh();
    }
  };

  const rotateCredential = async (device: VoiceDevice) => {
    if (
      !window.confirm(
        `Replace the credential for ${device.displayName}? The current credential will stop working immediately, and you will need to install the new one on the device.`,
      )
    )
      return;
    setRotatingDeviceId(device.id);
    setCredentialError(null);
    setRotatedCredential(null);
    try {
      const response = await fetch(
        `/api/voice/devices/${device.id}/rotate-credential`,
        { method: "POST" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        deviceId?: string;
        displayName?: string;
        token?: string;
        error?: string;
      };
      if (!response.ok || !result.token)
        throw new Error(result.error ?? "Could not replace device credential.");
      setRotatedCredential({
        deviceId: result.deviceId ?? device.id,
        displayName: result.displayName ?? device.displayName,
        token: result.token,
      });
    } catch (error) {
      setCredentialError({
        deviceId: device.id,
        message:
          error instanceof Error
            ? error.message
            : "Could not replace device credential.",
      });
    } finally {
      setRotatingDeviceId(null);
    }
  };

  const toggleHistory = async (deviceId: string) => {
    if (historyOpen === deviceId) {
      setHistoryOpen(null);
      return;
    }
    setHistoryOpen(deviceId);
    if (history[deviceId]) return;
    try {
      const [historyResponse, sessionsResponse] = await Promise.all([
        fetch(`/api/voice/devices/${deviceId}/history?limit=20`, {
          cache: "no-store",
        }),
        fetch(`/api/voice/devices/${deviceId}/sessions?limit=20`, {
          cache: "no-store",
        }),
      ]);
      const [result, sessionResult] = await Promise.all([
        historyResponse.json(),
        sessionsResponse.json(),
      ]);
      if (!historyResponse.ok)
        throw new Error(result.error ?? "Could not load recent transcripts.");
      if (!sessionsResponse.ok)
        throw new Error(
          sessionResult.error ?? "Could not load recent voice sessions.",
        );
      setHistory((current) => ({
        ...current,
        [deviceId]: {
          items: result.items ?? [],
          sessions: sessionResult.items ?? [],
          sessionsNextCursor: sessionResult.nextCursor ?? null,
        },
      }));
    } catch (error) {
      setHistory((current) => ({
        ...current,
        [deviceId]: {
          items: [],
          sessions: [],
          sessionsNextCursor: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load recent device history.",
        },
      }));
    }
  };

  const loadOlderSessions = async (deviceId: string) => {
    const cursor = history[deviceId]?.sessionsNextCursor;
    if (!cursor || history[deviceId]?.sessionsLoadingMore) return;
    setHistory((current) => ({
      ...current,
      [deviceId]: {
        ...current[deviceId],
        sessionsLoadingMore: true,
        sessionsError: undefined,
      },
    }));
    try {
      const response = await fetch(
        `/api/voice/devices/${encodeURIComponent(deviceId)}/sessions?limit=20&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => null)) as {
        items?: DeviceSession[];
        nextCursor?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !Array.isArray(result?.items))
        throw new Error(
          result?.error ?? "Could not load older device sessions.",
        );
      setHistory((current) => ({
        ...current,
        [deviceId]: {
          ...current[deviceId],
          sessions: [
            ...(current[deviceId]?.sessions ?? []),
            ...(result.items ?? []),
          ],
          sessionsNextCursor: result.nextCursor ?? null,
          sessionsLoadingMore: false,
        },
      }));
    } catch (error) {
      setHistory((current) => ({
        ...current,
        [deviceId]: {
          ...current[deviceId],
          sessionsLoadingMore: false,
          sessionsError:
            error instanceof Error
              ? error.message
              : "Could not load older device sessions.",
        },
      }));
    }
  };

  const continueTranscriptWithAssistant = (item: DeviceTranscript) => {
    window.location.assign(
      `/chat/${encodeURIComponent(item.threadId)}?processVoice=${encodeURIComponent(item.id)}`,
    );
  };

  const toggleSegments = async (deviceId: string, sessionId: string) => {
    const key = `${deviceId}:${sessionId}`;
    if (segmentsOpen[key]) {
      setSegmentsOpen((current) => ({ ...current, [key]: false }));
      return;
    }
    setSegmentsOpen((current) => ({ ...current, [key]: true }));
    if (segmentDetails[key]) return;
    setSegmentDetails((current) => ({
      ...current,
      [key]: { items: [], truncated: false, loading: true },
    }));
    try {
      const response = await fetch(
        `/api/voice/devices/${encodeURIComponent(deviceId)}/sessions/${encodeURIComponent(sessionId)}/segments`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => null)) as {
        items?: SessionSegment[];
        truncated?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !Array.isArray(result?.items))
        throw new Error(result?.error ?? "Could not load transcript segments.");
      setSegmentDetails((current) => ({
        ...current,
        [key]: {
          items: result.items ?? [],
          truncated: Boolean(result.truncated),
        },
      }));
    } catch (error) {
      setSegmentDetails((current) => ({
        ...current,
        [key]: {
          items: [],
          truncated: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load transcript segments.",
        },
      }));
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Eyebrow>Devices</Eyebrow>
          <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
            Voice devices
          </h1>
          <p className="text-sm text-muted-foreground">
            Pair and revoke supported M5Stack Atom Echo S3R devices.
          </p>
        </div>
        <Button onClick={createCode} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <AudioLines className="mr-2 size-4" />
          )}
          Create pairing code
        </Button>
      </div>
      {pairing && (
        <section className="mb-6 rounded-lg border p-4">
          <h2 className="font-medium">Pairing code</h2>
          <div className="my-3 flex items-center gap-3">
            <code className="text-3xl font-semibold tracking-[0.3em]">
              {pairing.code}
            </code>
            <Button
              size="icon"
              variant="outline"
              aria-label="Copy pairing code"
              onClick={() => void navigator.clipboard.writeText(pairing.code)}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Expires {new Date(pairing.expiresAt).toLocaleTimeString()} (about 10
            minutes). Enter this code on the device during setup.
          </p>
        </section>
      )}
      <section className="mb-6 rounded-lg border p-4">
        <h2 className="font-medium">Claim a device activation</h2>
        <p className="my-2 text-sm text-muted-foreground">
          Enter the six-digit code shown by a device during its initial setup.
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void claimActivation();
          }}
        >
          <Input
            aria-label="Device activation code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={activationCode}
            onChange={(event) =>
              setActivationCode(
                event.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
            className="w-36 font-mono tracking-[0.2em]"
          />
          <Button type="submit" disabled={busy || activationCode.length !== 6}>
            Claim device
          </Button>
        </form>
        {activationMessage && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {activationMessage}
          </p>
        )}
      </section>
      <section className="mb-6 rounded-lg border p-4 text-sm text-muted-foreground">
        Pairing and transcript history are available. Live hardware audio
        requires a separately deployed gateway; the reference checkout&apos;s
        WebSocket bridge is absent.
      </section>
      <div className="divide-y rounded-lg border">
        {devices.map((device) => (
          <article key={device.id} className="p-4">
            <div className="flex items-center gap-3">
              <AudioLines className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{device.displayName}</h2>
                <p className="text-xs text-muted-foreground">
                  {device.deviceType} · {device.status}
                  {device.firmwareVersion ? ` · ${device.firmwareVersion}` : ""}
                  {device.lastSeenAt
                    ? ` · Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                    : " · Not yet connected"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Show recent transcripts for ${device.displayName}`}
                onClick={() => void toggleHistory(device.id)}
              >
                <History className="size-4" />
              </Button>
              {device.status === "active" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rotatingDeviceId !== null}
                    onClick={() => void rotateCredential(device)}
                  >
                    {rotatingDeviceId === device.id ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="mr-1 size-3.5" />
                    )}
                    Rotate credential
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${device.displayName}`}
                    onClick={() => void revoke(device.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            {credentialError?.deviceId === device.id && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {credentialError.message}
              </p>
            )}
            {rotatedCredential?.deviceId === device.id && (
              <section
                className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
                aria-label="New device credential"
                role="status"
              >
                <h3 className="text-sm font-medium">
                  New credential for {rotatedCredential.displayName}
                </h3>
                <p className="my-2 text-xs text-muted-foreground">
                  The previous token is invalid. Copy this token now and
                  configure it on the device; it will not be shown again.
                </p>
                <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                  {rotatedCredential.token}
                </code>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        rotatedCredential.token,
                      )
                    }
                  >
                    <Copy className="mr-1 size-3.5" />
                    Copy token
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRotatedCredential(null)}
                  >
                    Hide token
                  </Button>
                </div>
              </section>
            )}
            {historyOpen === device.id && (
              <div className="mt-3 border-t pt-3" aria-live="polite">
                {!history[device.id] ? (
                  <p className="text-sm text-muted-foreground">
                    Loading recent transcripts…
                  </p>
                ) : history[device.id]?.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {history[device.id]?.error}
                  </p>
                ) : history[device.id]?.items.length ? (
                  <ul className="space-y-3">
                    {history[device.id]?.items.map((item) => (
                      <li key={item.id} className="rounded-md bg-muted/40 p-3">
                        <p className="whitespace-pre-wrap text-sm">
                          {item.text}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                          {item.language ? ` · ${item.language}` : ""} ·{" "}
                          <a
                            className="underline"
                            href={`/chat/${item.threadId}`}
                          >
                            Open conversation
                          </a>
                        </p>
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void continueTranscriptWithAssistant(item)
                          }
                        >
                          <Send className="mr-2 size-3.5" />
                          Continue with assistant
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {history[device.id] && !history[device.id]?.error && (
                  <section className="mt-4">
                    <h3 className="mb-2 text-sm font-medium">
                      Device audio sessions
                    </h3>
                    {history[device.id]?.sessions.length ? (
                      <ul className="space-y-3">
                        {history[device.id]?.sessions.map((item) => (
                          <li key={item.id} className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">
                              {item.status} · {item.segmentCount} transcript
                              segment{item.segmentCount === 1 ? "" : "s"} ·{" "}
                              {new Date(item.startedAt).toLocaleString()}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm">
                              {item.transcript ||
                                "No transcript text recorded."}
                            </p>
                            <Button
                              className="mt-2"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void toggleSegments(device.id, item.sessionId)
                              }
                            >
                              {segmentsOpen[`${device.id}:${item.sessionId}`]
                                ? "Hide segments"
                                : "Show segments"}
                            </Button>
                            {segmentsOpen[`${device.id}:${item.sessionId}`] && (
                              <div
                                className="mt-2 space-y-2"
                                aria-live="polite"
                              >
                                {segmentDetails[
                                  `${device.id}:${item.sessionId}`
                                ]?.loading ? (
                                  <p
                                    role="status"
                                    className="text-xs text-muted-foreground"
                                  >
                                    Loading transcript segments…
                                  </p>
                                ) : segmentDetails[
                                    `${device.id}:${item.sessionId}`
                                  ]?.error ? (
                                  <p
                                    role="alert"
                                    className="text-xs text-destructive"
                                  >
                                    {
                                      segmentDetails[
                                        `${device.id}:${item.sessionId}`
                                      ]?.error
                                    }
                                  </p>
                                ) : (
                                  segmentDetails[
                                    `${device.id}:${item.sessionId}`
                                  ]?.items.map((segment) => (
                                    <div
                                      key={segment.eventId}
                                      className="rounded border bg-background p-2"
                                    >
                                      <p className="whitespace-pre-wrap text-sm">
                                        {segment.text}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Segment {segment.sequenceNumber + 1}
                                        {segment.language
                                          ? ` · ${segment.language}`
                                          : ""}{" "}
                                        ·{" "}
                                        {new Date(
                                          segment.createdAt,
                                        ).toLocaleString()}
                                      </p>
                                    </div>
                                  ))
                                )}
                                {segmentDetails[
                                  `${device.id}:${item.sessionId}`
                                ]?.truncated && (
                                  <p className="text-xs text-muted-foreground">
                                    Transcript display is capped at 24,000
                                    characters.
                                  </p>
                                )}
                              </div>
                            )}
                            {item.finalizedAt && item.transcript && (
                              <VoiceCaptureSummaryPanel
                                deviceId={device.id}
                                sessionId={item.sessionId}
                              />
                            )}
                            {item.threadId && (
                              <a
                                className="mt-2 inline-block text-sm underline"
                                href={`/chat/${encodeURIComponent(item.threadId)}`}
                              >
                                Open conversation
                              </a>
                            )}
                            {item.finalizedAt &&
                              item.transcript &&
                              item.threadId &&
                              item.messageId && (
                                <div className="mt-2">
                                  <a
                                    className="inline-flex items-center text-sm font-medium underline"
                                    href={`/chat/${encodeURIComponent(item.threadId)}?processVoice=${encodeURIComponent(item.messageId)}`}
                                  >
                                    Review transcript with assistant
                                  </a>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Preview the request and choose whether to
                                    send it. No device command runs
                                    automatically.
                                  </p>
                                </div>
                              )}
                            {item.finalizedAt && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Finalized{" "}
                                {new Date(item.finalizedAt).toLocaleString()}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No recorded device audio sessions.
                      </p>
                    )}
                    {history[device.id]?.sessionsError && (
                      <p className="mt-2 text-sm text-destructive" role="alert">
                        {history[device.id]?.sessionsError}
                      </p>
                    )}
                    {history[device.id]?.sessionsNextCursor && (
                      <Button
                        className="mt-3"
                        variant="outline"
                        size="sm"
                        disabled={history[device.id]?.sessionsLoadingMore}
                        onClick={() => void loadOlderSessions(device.id)}
                      >
                        {history[device.id]?.sessionsLoadingMore
                          ? "Loading older sessions…"
                          : "Load older sessions"}
                      </Button>
                    )}
                  </section>
                )}
                {history[device.id] &&
                  !history[device.id]?.error &&
                  !history[device.id]?.items.length &&
                  !history[device.id]?.sessions.length && (
                    <p className="text-sm text-muted-foreground">
                      No saved transcripts or device sessions.
                    </p>
                  )}
              </div>
            )}
          </article>
        ))}
        {devices.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No paired devices yet.
          </p>
        )}
      </div>
    </main>
  );
}
