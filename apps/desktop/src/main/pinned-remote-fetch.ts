import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";
import type { Response as UndiciResponse } from "undici";
import type { RequestInit as UndiciRequestInit } from "undici";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type LookupAll = (hostname: string) => Promise<ResolvedAddress[]>;

function isGlobalUnicast(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

export async function resolvePublicAddresses(
  hostname: string,
  lookupAll: LookupAll = async (name) =>
    dnsLookup(name, { all: true, verbatim: true }) as Promise<
      ResolvedAddress[]
    >,
): Promise<ResolvedAddress[]> {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let addresses: ResolvedAddress[];
  if (isIP(normalized)) {
    addresses = [{ address: normalized, family: isIP(normalized) as 4 | 6 }];
  } else {
    addresses = await lookupAll(normalized);
  }
  if (addresses.length === 0 || addresses.length > 32) {
    throw new Error("Remote MCP host did not resolve to a bounded address set");
  }
  // Reject mixed public/private answers too. Pinning only a public answer can
  // otherwise conceal an attacker-controlled private fallback address.
  if (addresses.some(({ address }) => !isGlobalUnicast(address))) {
    throw new Error("Remote MCP host resolved to a non-public address");
  }
  return addresses;
}

export function createPinnedLookup(
  hostname: string,
  addresses: ResolvedAddress[],
) {
  let nextAddress = 0;
  return (
    requestedHostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      callback(new Error("Remote MCP attempted an unapproved DNS host"), "", 0);
      return;
    }
    const chosen = addresses[nextAddress++ % addresses.length]!;
    if (options.all) {
      callback(null, [{ address: chosen.address, family: chosen.family }]);
    } else {
      callback(null, chosen.address, chosen.family);
    }
  };
}

export const MAX_REMOTE_MCP_RESPONSE_BYTES = 4 * 1024 * 1024;

type ResponseAgent = Pick<Agent, "close" | "destroy">;
type BoundedResponse = Pick<
  UndiciResponse,
  "body" | "headers" | "status" | "statusText"
>;

/** Apply a byte limit before the MCP SDK consumes the remote response. */
export async function withBoundedRemoteMcpBody(
  response: BoundedResponse,
  agent: ResponseAgent,
  maxBytes = MAX_REMOTE_MCP_RESPONSE_BYTES,
): Promise<Response> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError(
      "Remote MCP response limit must be a positive integer",
    );
  }

  const cancelAndDestroy = async (reason: Error) => {
    await response.body?.cancel(reason).catch(() => undefined);
    await agent.destroy(reason);
  };

  if (response.status >= 300 && response.status < 400) {
    const error = new Error("Remote MCP redirects are disabled");
    await cancelAndDestroy(error);
    throw error;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/u.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      const error = new Error("Remote MCP response exceeded the byte limit");
      await cancelAndDestroy(error);
      throw error;
    }
  }

  if (!response.body) {
    await agent.close();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const reader = response.body.getReader();
  let bytesRead = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await agent.close();
        } else {
          bytesRead += value.byteLength;
          if (bytesRead > maxBytes) {
            const error = new Error(
              "Remote MCP response exceeded the byte limit",
            );
            await reader.cancel(error).catch(() => undefined);
            await agent.destroy(error);
            controller.error(error);
            return;
          }
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        await agent.destroy(error instanceof Error ? error : null);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      await agent.destroy(reason instanceof Error ? reason : null);
    },
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The SDK's fetch hook is the transport security boundary: every request is
 * origin-pinned, redirects are rejected, and Undici connects to a DNS answer
 * that was validated immediately before socket creation. TLS still sees the
 * original URL hostname, preserving certificate validation and SNI.
 */
export function createPinnedRemoteMcpFetch(
  approvedOrigin: string,
  baseHeaders: Record<string, string> = {},
  lookupAll?: LookupAll,
): FetchLike {
  const expectedOrigin = new URL(approvedOrigin).origin;
  return async (input: string | URL, init?: RequestInit) => {
    const requestInit = init ?? {};
    const url = new URL(input.toString());
    if (url.protocol !== "https:" || url.origin !== expectedOrigin) {
      throw new Error("Remote MCP request escaped its approved HTTPS origin");
    }
    if (requestInit.redirect && requestInit.redirect !== "error") {
      throw new Error("Remote MCP redirects are disabled");
    }
    const addresses = await resolvePublicAddresses(url.hostname, lookupAll);
    const agent = new Agent({
      maxRedirections: 0,
      connect: {
        lookup: createPinnedLookup(url.hostname, addresses) as never,
      },
    });
    try {
      const headers: Record<string, string> = { ...baseHeaders };
      const requestHeaders = requestInit.headers;
      if (Array.isArray(requestHeaders)) {
        for (const [name, value] of requestHeaders) headers[name] = value;
      } else if (
        requestHeaders &&
        typeof (requestHeaders as { forEach?: unknown }).forEach === "function"
      ) {
        (
          requestHeaders as {
            forEach: (callback: (value: string, name: string) => void) => void;
          }
        ).forEach((value, name) => {
          headers[name] = value;
        });
      } else if (requestHeaders) {
        Object.assign(headers, requestHeaders);
      }
      const response = await undiciFetch(url, {
        ...requestInit,
        headers,
        redirect: "error",
        dispatcher: agent,
      } as UndiciRequestInit);
      return await withBoundedRemoteMcpBody(response, agent);
    } catch (error) {
      await agent.destroy(error instanceof Error ? error : null);
      throw error;
    }
  };
}

export function getRemoteMcpOrigin(config: { url: string }) {
  return new URL(config.url).origin;
}
