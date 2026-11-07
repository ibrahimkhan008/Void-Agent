import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  hasSameOrigin: vi.fn(),
  getOwnedProjectThreadScope: vi.fn(),
  executeKnowledge: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/voice/project-status", () => ({
  getOwnedProjectThreadScope: mocks.getOwnedProjectThreadScope,
}));
vi.mock("lib/ai/tools/project-knowledge", () => ({
  createProjectKnowledgeGraphTool: vi.fn(() => ({
    execute: mocks.executeKnowledge,
  })),
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";

function request(body: unknown = { threadId, query: "release plan" }) {
  return new Request("https://app.test/api/voice/project-knowledge", {
    method: "POST",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voice/project-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getOwnedProjectThreadScope.mockResolvedValue({
      projectId,
      collectionIds: ["collection-1"],
    });
    mocks.executeKnowledge.mockResolvedValue({
      success: true,
      message: "Reviewed sources found.",
      results: [
        {
          claim: "Release is scheduled",
          evidence: "Approved for next week.",
          source: "https://docs.example.test/path?token=secret-value",
          sourceItemId: "internal-id",
        },
      ],
      recentEvents: [],
    });
  });

  it("searches only the server-resolved owned project thread and bounds citations", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getOwnedProjectThreadScope).toHaveBeenCalledWith(
      userId,
      threadId,
    );
    expect(mocks.executeKnowledge).toHaveBeenCalledWith(
      { query: "release plan" },
      expect.objectContaining({ toolCallId: "voice-project-knowledge" }),
    );
    const body = await response.json();
    expect(body.results[0].source).toBe("docs.example.test");
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(JSON.stringify(body)).not.toContain("internal-id");
  });

  it("requires auth, same origin, and rate allowance", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.hasSameOrigin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.getOwnedProjectThreadScope).not.toHaveBeenCalled();
  });

  it("rejects malformed, extra-scope, and out-of-range queries", async () => {
    expect(
      (await POST(request({ threadId, projectId, query: "abc" }))).status,
    ).toBe(400);
    expect(
      (await POST(request({ threadId: "bad", query: "release" }))).status,
    ).toBe(400);
    expect((await POST(request({ threadId, query: "x" }))).status).toBe(400);
    expect(
      (await POST(request({ threadId, query: "a".repeat(301) }))).status,
    ).toBe(400);
    expect(mocks.getOwnedProjectThreadScope).not.toHaveBeenCalled();
  });

  it("hides threads without current project access", async () => {
    mocks.getOwnedProjectThreadScope.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.executeKnowledge).not.toHaveBeenCalled();
  });

  it("caps result counts, evidence lengths, and oversized request bodies", async () => {
    mocks.executeKnowledge.mockResolvedValueOnce({
      success: true,
      message: "x".repeat(900),
      results: Array.from({ length: 10 }, () => ({
        claim: "c".repeat(400),
        evidence: "e".repeat(600),
        source: "source.md",
      })),
      recentEvents: Array.from({ length: 8 }, () => ({
        summary: "s".repeat(300),
        detail: "d".repeat(500),
        evidence: "e".repeat(500),
        source: "events.md",
      })),
    });
    const response = await POST(request());
    const result = await response.json();
    expect(result.message).toHaveLength(500);
    expect(result.results).toHaveLength(6);
    expect(result.results[0].claim).toHaveLength(240);
    expect(result.results[0].evidence).toHaveLength(320);
    expect(result.recentEvents).toHaveLength(4);
    expect(
      (await POST(request({ threadId, query: "q".repeat(3_000) }))).status,
    ).toBe(413);
  });
});
