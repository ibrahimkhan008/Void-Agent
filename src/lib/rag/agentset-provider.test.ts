import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createBoundedAgentsetFetcher,
  searchAgentsetProjectKnowledge,
} from "./agentset-provider";

const namespace = {
  success: true,
  data: {
    id: "ns_project_a",
    name: "Void-Agent project",
    slug: "void-project-placeholder",
    organizationId: "org_1",
    createdAt: "2026-01-01T00:00:00Z",
    embeddingConfig: null,
    vectorStoreConfig: null,
  },
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

describe("Agentset project search provider", () => {
  beforeEach(() => {
    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "true");
    vi.stubEnv("AGENTSET_API_KEY", "test-secret");
  });

  it("stays disabled unless explicitly enabled with a server API key", async () => {
    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "false");
    const fetcher = vi.fn();
    await expect(
      searchAgentsetProjectKnowledge({
        projectId: "project-a",
        query: "question",
        fetcher,
      }),
    ).resolves.toEqual({ enabled: false, results: [] });
    expect(fetcher).not.toHaveBeenCalled();

    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "true");
    vi.stubEnv("AGENTSET_API_KEY", "");
    await expect(
      searchAgentsetProjectKnowledge({
        projectId: "project-a",
        query: "question",
        fetcher,
      }),
    ).resolves.toEqual({ enabled: false, results: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a hashed project namespace and returns only owner/project scoped bounded hits", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(namespace))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: "chunk-good",
              score: 0.9,
              text: "A".repeat(8_000),
              metadata: {
                projectId: "project-a",
                ownerUserId: "owner-a",
                sourceStatus: "ready",
                filename: "brief.pdf",
                collectionId: "collection-a",
                collectionItemId: "item-a",
                documentId: "doc-a",
              },
            },
            {
              id: "chunk-foreign-project",
              score: 0.99,
              text: "foreign project",
              metadata: {
                projectId: "project-b",
                ownerUserId: "owner-a",
                sourceStatus: "ready",
              },
            },
            {
              id: "chunk-foreign-owner",
              score: 0.99,
              text: "foreign owner",
              metadata: {
                projectId: "project-a",
                ownerUserId: "owner-b",
                sourceStatus: "ready",
              },
            },
            {
              id: "chunk-stale",
              score: 0.99,
              text: "stale source",
              metadata: {
                projectId: "project-a",
                ownerUserId: "owner-a",
                sourceStatus: "processing",
              },
            },
          ],
        }),
      );

    const result = await searchAgentsetProjectKnowledge({
      projectId: "project-a",
      query: "  project question  ",
      limit: 50,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const namespaceRequest = fetcher.mock.calls[0];
    const namespaceUrl = requestUrl(namespaceRequest![0]);
    expect(namespaceUrl.origin).toBe("https://api.agentset.ai");
    expect(namespaceUrl.pathname).toMatch(
      /^\/v1\/namespace\/void-project-[a-f0-9]{32}$/,
    );
    expect(
      new Headers(namespaceRequest?.[1]?.headers).get("authorization"),
    ).toBe("Bearer test-secret");

    const searchRequest = fetcher.mock.calls[1];
    expect(requestUrl(searchRequest![0]).pathname).toBe(
      "/v1/namespace/ns_project_a/search",
    );
    expect(JSON.parse(String(searchRequest?.[1]?.body))).toMatchObject({
      query: "project question",
      topK: 20,
      rerank: true,
      rerankLimit: 8,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.content).toHaveLength(6_000);
    expect(result.results[0]?.metadata).toMatchObject({
      projectId: "project-a",
      ownerUserId: "owner-a",
      collectionItemId: "item-a",
      sourceStatus: "ready",
    });
  });

  it("validates query bounds before making HTTP requests", async () => {
    const fetcher = vi.fn();
    await expect(
      searchAgentsetProjectKnowledge({
        projectId: "project-a",
        query: " ",
        fetcher,
      }),
    ).rejects.toThrow("1 to 2000 characters");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects non-Agentset origins and mutating HTTP methods", async () => {
    const fetcher = createBoundedAgentsetFetcher(vi.fn());
    await expect(
      fetcher("https://attacker.test/v1/namespace/ns_1/search"),
    ).rejects.toThrow("official HTTPS API origin");
    await expect(
      fetcher("https://api.agentset.ai/v1/namespace/ns_1", {
        method: "DELETE",
      }),
    ).rejects.toThrow("only permits read requests");
  });

  it("rejects oversized upstream response bodies", async () => {
    const fetcher = createBoundedAgentsetFetcher(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("large", {
          headers: { "content-length": "1000001" },
        }),
      ),
    );
    await expect(
      fetcher("https://api.agentset.ai/v1/namespace/ns_1"),
    ).rejects.toThrow("response exceeded the configured size limit");
  });
});
