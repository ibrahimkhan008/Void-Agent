import { describe, expect, it, vi } from "vitest";
import {
  createPinnedLookup,
  createPinnedRemoteMcpFetch,
  resolvePublicAddresses,
  withBoundedRemoteMcpBody,
} from "./pinned-remote-fetch.js";

describe("desktop remote MCP destination pinning", () => {
  it("rejects loopback, private, link-local, mapped, and mixed DNS answers", async () => {
    for (const address of [
      "127.0.0.1",
      "10.2.3.4",
      "169.254.169.254",
      "::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      await expect(
        resolvePublicAddresses("mcp.example", async () => [
          { address, family: address.includes(":") ? 6 : 4 },
        ]),
      ).rejects.toThrow("non-public");
    }
    await expect(
      resolvePublicAddresses("mixed.example", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ]),
    ).rejects.toThrow("non-public");
  });

  it("accepts only public unicast DNS results and bounds the answer set", async () => {
    const lookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
    ]);
    await expect(
      resolvePublicAddresses("MCP.EXAMPLE", lookup),
    ).resolves.toEqual(await lookup.mock.results[0]?.value);
    expect(lookup).toHaveBeenCalledWith("mcp.example");
    await expect(
      resolvePublicAddresses("too-many.example", async () =>
        Array.from({ length: 33 }, () => ({
          address: "93.184.216.34",
          family: 4 as const,
        })),
      ),
    ).rejects.toThrow("bounded address set");
  });

  it("pins the socket lookup to the validated IPs and rejects hostname changes", () => {
    const lookup = createPinnedLookup("mcp.example", [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const calls: unknown[][] = [];
    const callback = (...args: unknown[]) => calls.push(args);
    lookup("mcp.example", {}, callback);
    lookup("mcp.example", { all: true }, callback);
    expect(calls).toEqual([
      [null, "93.184.216.34", 4],
      [null, [{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]],
    ]);
    lookup("attacker.example", {}, callback);
    expect(calls[2]?.[0]).toBeInstanceOf(Error);
  });

  it("rejects non-HTTPS, cross-origin, and redirected requests before network access", async () => {
    const safeFetch = createPinnedRemoteMcpFetch(
      "https://mcp.example",
      {},
      async () => [{ address: "93.184.216.34", family: 4 }],
    );
    await expect(safeFetch("http://mcp.example/rpc")).rejects.toThrow(
      "approved HTTPS origin",
    );
    await expect(safeFetch("https://other.example/rpc")).rejects.toThrow(
      "approved HTTPS origin",
    );
    await expect(
      safeFetch("https://mcp.example/rpc", { redirect: "follow" }),
    ).rejects.toThrow("redirects are disabled");
  });

  it("fails closed when DNS resolution fails", async () => {
    const safeFetch = createPinnedRemoteMcpFetch(
      "https://mcp.example",
      {},
      async () => {
        throw new Error("DNS unavailable");
      },
    );
    await expect(safeFetch("https://mcp.example/rpc")).rejects.toThrow(
      "DNS unavailable",
    );
  });

  it("cancels an oversized chunked response and destroys its pinned agent", async () => {
    const cancel = vi.fn();
    let index = 0;
    const chunks = Array.from({ length: 8 }, () => new Uint8Array([1, 2, 3]));
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks[index++];
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
        cancel,
      }),
    );
    const agent = { close: vi.fn(), destroy: vi.fn() };
    const bounded = await withBoundedRemoteMcpBody(
      response as never,
      agent as never,
      5,
    );

    await expect(bounded.arrayBuffer()).rejects.toThrow(
      "response exceeded the byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(agent.destroy).toHaveBeenCalledOnce();
    expect(agent.close).not.toHaveBeenCalled();
  });

  it("rejects declared oversize and redirect responses before body consumption", async () => {
    const cancel = vi.fn();
    const source = () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel,
      });
    const agent = { close: vi.fn(), destroy: vi.fn() };

    await expect(
      withBoundedRemoteMcpBody(
        new Response(source(), {
          headers: { "content-length": "11" },
        }) as never,
        agent as never,
        10,
      ),
    ).rejects.toThrow("byte limit");
    await expect(
      withBoundedRemoteMcpBody(
        new Response(source(), {
          status: 302,
          headers: { location: "https://other.example/" },
        }) as never,
        agent as never,
        10,
      ),
    ).rejects.toThrow("redirects are disabled");

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(agent.destroy).toHaveBeenCalledTimes(2);
    expect(agent.close).not.toHaveBeenCalled();
  });
});
