import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createBoundedSeoFetch, seoConfigSchema, summarizeSeo } from "./seo";

describe("SEO Cockpit provider helpers", () => {
  it("accepts a bare domain and bounded credentials only", () => {
    expect(seoConfigSchema.safeParse({ kind: "dataforseo", login: "api-user", password: "secret", domain: "example.com" }).success).toBe(true);
    for (const domain of ["https://example.com", "example.com/path", "localhost", "bad domain.com"]) {
      expect(seoConfigSchema.safeParse({ kind: "dataforseo", login: "api-user", password: "secret", domain }).success).toBe(false);
    }
    expect(seoConfigSchema.safeParse({ kind: "dataforseo", login: "user\nInjected", password: "secret", domain: "example.com" }).success).toBe(false);
  });

  it("summarizes nested DataForSEO responses and limits keyword rows", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ keyword_data: { keyword: `term ${i}`, keyword_info: { search_volume: 100 - i } }, ranked_serp_element: { rank_absolute: i + 1 }, previous_position: i + 2 }));
    const summary = summarizeSeo({ domain: "example.com", overview: { tasks: [{ result: [{ etv: 320, count: 73 }] }] }, keywords: { tasks: [{ result: [{ items: rows, total_count: 250 }] }] }, backlinks: { result: [{ referring_domains: 19 }] } });
    expect(summary).toEqual({ domain: "example.com", organicTraffic: 320, keywordsCount: 73, referringDomains: 19, topKeywords: rows.slice(0, 10).map((_row, index) => ({ keyword: `term ${index}`, position: index + 1, previousPosition: index + 2, volume: 100 - index })) });
  });

  it("pins outbound fetches to the DataForSEO MCP endpoint and rejects redirects", async () => {
    const bounded = createBoundedSeoFetch(8);
    await expect(bounded("https://attacker.test/mcp")).rejects.toThrow("seo_endpoint_rejected");
    await expect(bounded("https://mcp.dataforseo.com/v3/mcp?url=https://attacker.test")).rejects.toThrow("seo_endpoint_rejected");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect rejected by fetch");
    });
    try {
      await expect(bounded("https://mcp.dataforseo.com/v3/mcp")).rejects.toThrow("redirect rejected");
      expect(fetchSpy).toHaveBeenCalledWith("https://mcp.dataforseo.com/v3/mcp", expect.objectContaining({ redirect: "error" }));
    } finally { fetchSpy.mockRestore(); }
  });

  it("cancels declared-oversized bodies and errors on streamed overflow", async () => {
    const bounded = createBoundedSeoFetch(8);
    const cancel = vi.fn();
    const oversized = new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "content-length": "9" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(oversized).mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(9)); controller.close(); } })));
    try {
      await expect(bounded("https://mcp.dataforseo.com/v3/mcp")).rejects.toThrow("seo_response_too_large");
      expect(cancel).toHaveBeenCalledOnce();
      const response = await bounded("https://mcp.dataforseo.com/v3/mcp");
      await expect(response.text()).rejects.toThrow("seo_response_too_large");
    } finally { fetchSpy.mockRestore(); }
  });
});
