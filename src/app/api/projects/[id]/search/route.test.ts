import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  hasSameOrigin: vi.fn(),
  search: vi.fn(),
  filterSources: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/rag/agentset-provider", () => ({
  searchAgentsetProjectKnowledge: mocks.search,
}));
vi.mock("lib/rag/agentset-source-access", () => ({
  filterCurrentAgentsetProjectSources: mocks.filterSources,
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "project-1" });

function post(body: unknown) {
  return new Request("https://example.test/api/projects/project-1/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/[id]/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "true");
    vi.stubEnv("AGENTSET_API_KEY", "test-secret");
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "viewer",
      project: { id: "project-1", userId: "owner-1" },
    });
    mocks.search.mockResolvedValue({
      enabled: true,
      results: [{ content: "evidence", source: "brief.pdf", score: 0.8 }],
    });
    mocks.filterSources.mockImplementation(async ({ hits }) => hits);
  });

  it("requires same-origin authenticated project access and rechecks source visibility", async () => {
    const response = await POST(post({ query: "question" }), { params });
    expect(response.status).toBe(200);
    expect(mocks.getProjectAccess).toHaveBeenCalledWith(
      "project-1",
      "member-1",
    );
    expect(mocks.search).toHaveBeenCalledWith({
      projectId: "project-1",
      query: "question",
      limit: undefined,
    });
    expect(mocks.filterSources).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "member-1",
      hits: [{ content: "evidence", source: "brief.pdf", score: 0.8 }],
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects cross-origin, anonymous, and unauthorized access before provider calls", async () => {
    mocks.hasSameOrigin.mockReturnValueOnce(false);
    expect((await POST(post({ query: "question" }), { params })).status).toBe(
      403,
    );
    expect(mocks.getSession).not.toHaveBeenCalled();

    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(post({ query: "question" }), { params })).status).toBe(
      401,
    );

    mocks.getProjectAccess.mockResolvedValueOnce(null);
    expect((await POST(post({ query: "question" }), { params })).status).toBe(
      404,
    );
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects invalid/oversized queries and enforces the request byte limit", async () => {
    expect((await POST(post({ query: " " }), { params })).status).toBe(400);
    const oversized = new Request("https://example.test/search", {
      method: "POST",
      headers: { "content-length": "9000", "content-type": "application/json" },
      body: JSON.stringify({ query: "question" }),
    });
    expect((await POST(oversized, { params })).status).toBe(413);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("fails closed when the managed provider is disabled or unconfigured", async () => {
    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "false");
    const response = await POST(post({ query: "question" }), { params });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "agentset_project_search_disabled",
    });
    expect(mocks.search).not.toHaveBeenCalled();

    vi.stubEnv("AGENTSET_PROJECT_SEARCH_ENABLED", "true");
    vi.stubEnv("AGENTSET_API_KEY", "");
    expect((await POST(post({ query: "question" }), { params })).status).toBe(
      503,
    );
  });
});
