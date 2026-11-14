import "server-only";

import { steelEgressProxyUrl } from "lib/browser-egress/capability";
import type { KernelBrowserSession } from "lib/kernel/browser-contract";

/**
 * The self-hosted Steel provider (github.com/steel-dev/steel-browser,
 * Apache-2.0): a free, single-active-session Kernel replacement.
 *
 * Steel manages the session lifecycle and exposes the live-view UI at /ui;
 * its WebSocket root is the CDP endpoint of the active session's browser.
 * Steel does NOT execute code remotely, so the model's Playwright code runs
 * in the steel-executor sidecar (docker/steel-executor) — an isolated
 * container on the internal network, which is what keeps model code off the
 * app server exactly like Kernel's hosted runtime does.
 *
 * Both base URLs are internal-network addresses (no auth on Steel — never
 * expose it publicly):
 * - STEEL_BASE_URL      e.g. http://steel:3000        (app + executor reach it)
 * - STEEL_EXECUTOR_URL  e.g. http://steel-executor:8080
 * - STEEL_PUBLIC_BASE_URL (optional) the address the USER'S browser uses for
 *   the live view, e.g. https://browser.<domain> behind a tunnel — defaults
 *   to STEEL_BASE_URL.
 *
 * Concurrency is ONE active session: creating a session while one is live
 * releases the old browser, which would clobber a concurrent run, so this
 * module serializes runs with a local mutex and fails fast when busy.
 */

export const IS_STEEL_CONFIGURED = Boolean(
  process.env.STEEL_BASE_URL?.trim() && process.env.STEEL_EXECUTOR_URL?.trim(),
);

const steelBaseUrl = () => process.env.STEEL_BASE_URL!.replace(/\/$/, "");
const steelExecutorUrl = () =>
  process.env.STEEL_EXECUTOR_URL!.replace(/\/$/, "");

/** The user-facing address of Steel's /ui live view. */
export const steelLiveViewUrl = () =>
  `${(process.env.STEEL_PUBLIC_BASE_URL?.trim() || steelBaseUrl()).replace(
    /\/$/,
    "",
  )}/ui/`;

/** The session's CDP endpoint: the ws form of Steel's internal base URL. */
const steelCdpUrl = () => steelBaseUrl().replace(/^http/, "ws") + "/";

/** Serialized one-run-at-a-time gate for the single-active-session provider. */
const steelSlotHeldBy = new Set<string>();

const STEEL_BUSY_ERROR =
  "A Steel browser session is already running on this deployment, and self-hosted Steel serves one session at a time. Try again when it finishes.";

/**
 * Serialize Steel runs. The slot is acquired at session creation and released
 * at session destruction, so one run holds it end to end. The mutex is per
 * process — good enough for a single node (dev, the VPS); a horizontally
 * scaled deployment needs a shared lock, and the busy error names the cause
 * honestly if that ever happens.
 */
function acquireSteelSlot(sessionId: string): void {
  if (steelSlotHeldBy.size > 0) {
    throw new Error(STEEL_BUSY_ERROR);
  }
  steelSlotHeldBy.add(sessionId);
}

function releaseSteelSlot(sessionId: string): void {
  steelSlotHeldBy.delete(sessionId);
}

interface SteelSessionResponse {
  id: string;
  status: string;
}

async function steelRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${steelBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Steel request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * Launch the active Steel session.
 *
 * No credential-profile support on this provider (the vault belongs to
 * Kernel's profile system) — `profile` is accepted for signature parity and
 * ignored.
 */
export async function createSteelBrowserSession(_options?: {
  profile?: { name: string; saveChanges: boolean };
}): Promise<KernelBrowserSession> {
  // Fail fast BEFORE spending the create call when a run already holds the
  // single slot — releasing someone else's browser mid-run would clobber it.
  if (steelSlotHeldBy.size > 0) {
    throw new Error(STEEL_BUSY_ERROR);
  }

  // B20: every Steel session routes ALL browser traffic through the egress
  // proxy when one is configured — required for the provider to bind at all.
  const egressProxy = steelEgressProxyUrl();
  const created = await steelRequest<SteelSessionResponse>("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({
      blockAds: false,
      ...(egressProxy ? { proxyUrl: egressProxy } : {}),
    }),
  });
  if (!created.id) {
    throw new Error("Steel returned a session without an id");
  }
  acquireSteelSlot(created.id);

  return {
    sessionId: created.id,
    // The live view is the feature: the UI at /ui watches the active session.
    liveViewUrl: steelLiveViewUrl(),
    // The self-hosted image runs headless Chrome (verified: /json/version).
    browserType: "headless",
    startedAt: Date.now(),
    // No Kernel-style profile cookie writeback on this provider.
    saveChanges: false,
  };
}

/**
 * Release the session. Steel's endpoint is POST /v1/sessions/:id/release;
 * never throws — the session also self-releases, and the inactivity
 * lifecycle is Steel's job.
 */
export async function destroySteelBrowserSession(
  session: Pick<KernelBrowserSession, "sessionId">,
): Promise<void> {
  try {
    await steelRequest(`/v1/sessions/${session.sessionId}/release`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.warn(
      `[steel] failed to release session ${session.sessionId}:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    // The slot frees even when the release call failed: the session also
    // self-releases, and a leaked slot would block every future run.
    releaseSteelSlot(session.sessionId);
  }
}

/**
 * Execute Playwright code in the executor sidecar. Same contract as Kernel's
 * `browsers.playwright.execute`: the code runs with `page`, `context`,
 * `browser` and `playwright` in scope, and its return value comes back as the
 * tool result.
 */
export async function steelPlaywrightExecute(
  code: string,
  timeoutSec?: number,
): Promise<unknown> {
  const response = await fetch(`${steelExecutorUrl()}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cdpUrl: steelCdpUrl(),
      code,
      timeoutSec,
    }),
    // Small margin over the code's own timeout, so the executor's timeout
    // error is what the model sees rather than this fetch's.
    signal: AbortSignal.timeout(((timeoutSec ?? 60) + 15) * 1_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Steel executor failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
  const payload = (await response.json()) as {
    ok: boolean;
    result?: string;
    error?: string;
  };
  if (!payload.ok) {
    throw new Error(payload.error ?? "Steel executor reported a failure");
  }
  return payload.result ?? "";
}
