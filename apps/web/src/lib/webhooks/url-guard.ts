// ---------------------------------------------------------------------------
// SSRF guard for user-supplied webhook URLs.
//
// Webhook subscriptions are created by end users and later fetched
// server-side by the delivery worker. Without validation a subscriber can
// point at loopback / private-network / link-local (cloud metadata)
// addresses and turn the platform into an SSRF proxy.
//
// NOTE: intentionally no `import "server-only"` — this module is a pure
// utility that unit tests load directly; all its callers are server-side.
//
// `assertPublicHttpUrl` enforces:
//   - https scheme only (http would leak signatures in transit)
//   - hostname resolves via DNS to a public unicast address
//   - rejects credentials-in-URL, non-standard ports are allowed but the
//     IP checks still apply to whatever the name resolves to
//
// It is used BOTH when a subscription is registered and immediately before
// every delivery attempt, so a DNS rebinding or stale allowlisted record
// cannot slip through.
// ---------------------------------------------------------------------------

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlBlockedError";
  }
}

const isPrivateIpv4 = (b: number[]): boolean => {
  // 0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
  // 192.0.0/24, 192.168/16, 198.18/15, 240/4 (reserved), 255.255.255.255
  const [a, b2] = b;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b2 >= 64 && b2 <= 127) return true;
  if (a === 169 && b2 === 254) return true;
  if (a === 172 && b2 >= 16 && b2 <= 31) return true;
  if (a === 192 && b2 === 0) return true;
  if (a === 192 && b2 === 168) return true;
  if (a === 198 && (b2 === 18 || b2 === 19)) return true;
  if (a >= 240) return true;
  return false;
};

const isPrivateIpv6 = (groups: string[]): boolean => {
  const lower = groups.join(":").toLowerCase().replace(/^:+/u, "::");
  if (lower.includes(".")) {
    const dotted = lower.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (!dotted) return true;
    const octets = dotted[2].split(".").map(Number);
    if (octets.length !== 4 || octets.some((value) => value < 0 || value > 255))
      return true;
    if (dotted[1].replace(/:$/, "") !== "::ffff") return true;
    return isPrivateIpv4(octets);
  }
  const halves = lower.split("::");
  if (halves.length > 2) return true;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return true;
  const parts = [...left, ...Array(missing).fill("0"), ...right].map((part) =>
    Number.parseInt(part, 16),
  );
  if (
    parts.length !== 8 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)
  )
    return true;
  if (
    parts.every((part) => part === 0) ||
    (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)
  )
    return true;
  if ((parts[0] & 0xffc0) === 0xfe80) return true;
  if ((parts[0] & 0xfe00) === 0xfc00) return true;
  if ((parts[0] & 0xff00) === 0xff00) return true;
  const hasPrefix = (prefix: number[]) =>
    prefix.every((part, index) => parts[index] === part);
  if (
    hasPrefix([0, 0, 0, 0, 0, 0xffff]) ||
    hasPrefix([0x64, 0xff9b, 0, 0, 0, 0])
  ) {
    const high = parts[6];
    const low = parts[7];
    return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255]);
  }
  if (parts.slice(0, 6).every((part) => part === 0)) return true;
  return false;
};

const isPrivateAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address.split(".").map(Number));
  }
  if (family === 6) {
    return isPrivateIpv6(address.split(":"));
  }
  return true; // unparseable → treat as unsafe
};

/**
 * Validate that `raw` is an https URL whose host currently resolves to a
 * public address. Throws UrlBlockedError with a safe message on failure.
 */
export const resolvePublicWebhookUrl = async (raw: string) => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlBlockedError("Invalid webhook URL");
  }

  if (url.protocol !== "https:") {
    throw new UrlBlockedError("Webhook URL must use https");
  }
  if (url.username || url.password) {
    throw new UrlBlockedError("Webhook URL must not contain credentials");
  }

  let addresses;
  let lookupTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        lookupTimeout = setTimeout(
          () => reject(new UrlBlockedError("Webhook host lookup timed out")),
          5_000,
        );
        lookupTimeout.unref?.();
      }),
    ]);
  } catch (error) {
    if (error instanceof UrlBlockedError) throw error;
    throw new UrlBlockedError("Webhook host does not resolve");
  } finally {
    if (lookupTimeout) clearTimeout(lookupTimeout);
  }

  if (addresses.length === 0) {
    throw new UrlBlockedError("Webhook host does not resolve");
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UrlBlockedError(
        "Webhook host resolves to a non-public address",
      );
    }
  }

  return { url, addresses };
};

export const assertPublicWebhookUrl = async (raw: string): Promise<URL> =>
  (await resolvePublicWebhookUrl(raw)).url;
