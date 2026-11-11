// ---------------------------------------------------------------------------
// P3.4 — Pinned webhook delivery + exponential backoff.
// ---------------------------------------------------------------------------

import { Agent, request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { formatSignatureHeader } from "./sign";
import { UrlBlockedError, resolvePublicWebhookUrl } from "./url-guard";

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "flare-webhooks/1";
const SIGNATURE_HEADER = "X-Webhook-Signature";
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const BASE_BACKOFF_MS = 1000;
const JITTER_RATIO = 0.2;

export type DeliveryResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; error: string };

export interface DeliverWebhookInput {
  url: string;
  payload: string;
  signature: string;
  timestamp: string;
  timeoutMs?: number;
}

/**
 * Deliver a signed webhook using the exact public IPs returned by the URL
 * guard. Node's HTTPS transport normally performs another DNS lookup after a
 * preflight check; using a pinned lookup callback closes that rebinding gap.
 * The transport does not follow redirects, so a public endpoint cannot redirect
 * the server toward loopback, private, link-local, or metadata addresses.
 */
export const deliverWebhook = async (
  input: DeliverWebhookInput,
): Promise<DeliveryResult> => {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let abortWhileResolving: (() => void) | undefined;
    const validationOrTimeout = new Promise<never>((_, reject) => {
      abortWhileResolving = () => reject(new Error("timeout"));
      controller.signal.addEventListener("abort", abortWhileResolving, {
        once: true,
      });
    });
    const validated = await Promise.race([
      resolvePublicWebhookUrl(input.url),
      validationOrTimeout,
    ]).finally(() => {
      if (abortWhileResolving) {
        controller.signal.removeEventListener("abort", abortWhileResolving);
      }
    });

    if (controller.signal.aborted) return { ok: false, error: "timeout" };

    const expectedHostname = validated.url.hostname.toLowerCase();
    const addresses = validated.addresses;
    if (addresses.length === 0) {
      return { ok: false, error: "blocked: webhook host does not resolve" };
    }

    let addressIndex = 0;
    const pinnedLookup: LookupFunction = (hostname, options, callback) => {
      if (hostname.toLowerCase() !== expectedHostname) {
        const error = Object.assign(new Error("hostname lookup mismatch"), {
          code: "ENOTFOUND",
        });
        callback(error, "", 0);
        return;
      }

      const familyAddresses = options?.family
        ? addresses.filter((entry) => entry.family === options.family)
        : addresses;
      if (familyAddresses.length === 0) {
        const error = Object.assign(
          new Error("no address for requested family"),
          {
            code: "ENOTFOUND",
          },
        );
        callback(error, "", 0);
        return;
      }

      // Rotate over the already validated DNS answers for new sockets. The
      // callback never consults DNS, including when a connection retries.
      const address = familyAddresses[addressIndex++ % familyAddresses.length];
      if (options && typeof options === "object" && options.all) {
        callback(null, familyAddresses);
      } else {
        callback(null, address.address, address.family);
      }
    };

    return await new Promise<DeliveryResult>((resolve) => {
      // Use a private direct agent. This prevents a process-wide proxy agent
      // or a reused socket from replacing the pinned destination lookup.
      const agent = new Agent({ lookup: pinnedLookup });
      const finish = (result: DeliveryResult) => {
        agent.destroy();
        resolve(result);
      };
      const request = httpsRequest(
        validated.url,
        {
          agent,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [SIGNATURE_HEADER]: formatSignatureHeader(
              input.signature,
              input.timestamp,
            ),
            "User-Agent": USER_AGENT,
          },
          lookup: pinnedLookup,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          // Node's https.request never follows redirects. Drain the response
          // without buffering it, while keeping the timeout active.
          response.once("end", () => {
            if (controller.signal.aborted) {
              finish({ ok: false, error: "timeout" });
            } else if (status >= 300 && status < 400) {
              finish({ ok: false, status, error: "redirect blocked" });
            } else if (status >= 200 && status < 300) {
              finish({ ok: true, status });
            } else {
              finish({
                ok: false,
                status,
                error: response.statusMessage || "Webhook request failed",
              });
            }
          });
          response.once("error", (error) => {
            finish({
              ok: false,
              ...(status ? { status } : {}),
              error: controller.signal.aborted
                ? "timeout"
                : error instanceof Error
                  ? error.message
                  : "Webhook response failed",
            });
          });
          response.resume();
        },
      );

      request.once("error", (error: Error) => {
        finish({
          ok: false,
          error: controller.signal.aborted ? "timeout" : error.message,
        });
      });
      controller.signal.addEventListener(
        "abort",
        () => request.destroy(new Error("timeout")),
        { once: true },
      );
      request.end(input.payload);
    });
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.message === "timeout")
    ) {
      return { ok: false, error: "timeout" };
    }
    const reason =
      error instanceof UrlBlockedError
        ? error.message
        : "webhook URL failed safety checks";
    return { ok: false, error: `blocked: ${reason}` };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const computeBackoffMs = (attempt: number): number => {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
};
