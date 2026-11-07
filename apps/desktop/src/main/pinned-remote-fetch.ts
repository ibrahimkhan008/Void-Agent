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

function withPinnedBody(response: UndiciResponse, agent: Agent): Response {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  if (!response.body) {
    void agent.close();
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await agent.close();
        } else {
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
      return withPinnedBody(response, agent);
    } catch (error) {
      await agent.destroy(error instanceof Error ? error : null);
      throw error;
    }
  };
}

export function getRemoteMcpOrigin(config: { url: string }) {
  return new URL(config.url).origin;
}
