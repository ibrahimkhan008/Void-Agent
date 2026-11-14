import "server-only";

/**
 * B20 — per-provider egress isolation capability.
 *
 * The historical requirement (docs/archive/security-review.md): browser
 * execution may only run where a NETWORK-LEVEL egress boundary is actually
 * enforced — not an app-side URL check. The enforcement point differs per
 * provider, and a provider counts as isolated only when its boundary is
 * configured:
 *
 * - Kernel (cloud): `KERNEL_EGRESS_MODE=managed` routes the browser through
 *   Kernel's managed proxy pool — egress stays in their infrastructure, off
 *   our network. `direct` is explicitly NOT isolated (the audit rejected it).
 * - Steel (self-hosted): `STEEL_EGRESS_PROXY_URL` forces every Steel session
 *   through the egress-proxy sidecar (docker/egress-proxy), which resolves
 *   DNS itself, pins the resolved IP, and denies loopback/private/link-local/
 *   metadata destinations before opening any connection. Covers redirects,
 *   subresources and WebSockets by construction (every hop re-enters the
 *   proxy).
 * - agent-browser CLI (local): `AGENT_BROWSER_EGRESS_PROXY_URL` is passed to
 *   the CLI as its proxy (`--proxy-server` under the hood) with bypass lists
 *   stripped, so the local Chrome's entire traffic also flows through the
 *   egress proxy.
 *
 * `BROWSER_EGRESS_ISOLATION_ENABLED=true` remains the operator's master
 * acknowledgment on top of all of this — the feature is fail-closed twice.
 */

export type BrowserProviderId = "kernel" | "steel" | "agent-browser";

export function isBrowserEgressIsolationEnabled(): boolean {
  return process.env.BROWSER_EGRESS_ISOLATION_ENABLED === "true";
}

/** Kernel counts as isolated only in its managed-proxy mode. */
export function kernelEgressIsolated(): boolean {
  return process.env.KERNEL_EGRESS_MODE?.trim().toLowerCase() === "managed";
}

/** Steel counts as isolated only with the egress proxy configured. */
export function steelEgressIsolated(): boolean {
  return Boolean(process.env.STEEL_EGRESS_PROXY_URL?.trim());
}

/** agent-browser counts as isolated only with the egress proxy configured. */
export function agentBrowserEgressIsolated(): boolean {
  return Boolean(process.env.AGENT_BROWSER_EGRESS_PROXY_URL?.trim());
}

/** Steel's egress proxy URL, passed to every Steel session as `proxyUrl`. */
export function steelEgressProxyUrl(): string | null {
  const value = process.env.STEEL_EGRESS_PROXY_URL?.trim();
  return value ? value : null;
}

/** The CLI's proxy env value (AGENT_BROWSER_PROXY), when isolation is on. */
export function agentBrowserEgressProxyUrl(): string | null {
  const value = process.env.AGENT_BROWSER_EGRESS_PROXY_URL?.trim();
  return value ? value : null;
}

/** Kernel's proxy mode for session creation (managed when isolated). */
export function kernelProxyMode(): "direct" | "managed" {
  return kernelEgressIsolated() ? "managed" : "direct";
}

export const EGRESS_FIX_HINTS: Record<BrowserProviderId, string> = {
  kernel: "Kernel egress is not isolated — set KERNEL_EGRESS_MODE=managed",
  steel:
    "Steel egress is not isolated — set STEEL_EGRESS_PROXY_URL to the egress-proxy sidecar",
  "agent-browser":
    "agent-browser egress is not isolated — set AGENT_BROWSER_EGRESS_PROXY_URL to the egress-proxy",
};

export interface IsolatedProvider {
  id: BrowserProviderId;
  egressIsolated: boolean;
}

/**
 * Pick the browser provider to bind, in preference order, considering BOTH
 * configuration and egress isolation. Returns the first provider that is
 * configured AND isolated; when a higher-preference provider is configured
 * but not isolated, it records why so the gate can say exactly what to set.
 */
export function selectIsolatedBrowserProvider(input: {
  kernelConfigured: boolean;
  steelConfigured: boolean;
  agentBrowserConfigured: boolean;
}): {
  provider: BrowserProviderId | null;
  skippedBy: BrowserProviderId | null;
} {
  const candidates: Array<{
    id: BrowserProviderId;
    configured: boolean;
    isolated: boolean;
  }> = [
    {
      id: "kernel",
      configured: input.kernelConfigured,
      isolated: kernelEgressIsolated(),
    },
    {
      id: "steel",
      configured: input.steelConfigured,
      isolated: steelEgressIsolated(),
    },
    {
      id: "agent-browser",
      configured: input.agentBrowserConfigured,
      isolated: agentBrowserEgressIsolated(),
    },
  ];
  let skippedBy: BrowserProviderId | null = null;
  for (const candidate of candidates) {
    if (!candidate.configured) continue;
    if (candidate.isolated) {
      return { provider: candidate.id, skippedBy };
    }
    if (!skippedBy) skippedBy = candidate.id;
  }
  return { provider: null, skippedBy };
}
