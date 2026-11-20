import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canCreateAgent: vi.fn(),
  selectAgentById: vi.fn(),
  insertAgent: vi.fn(),
  incrementAgentForkCount: vi.fn(),
  getPublishedAgent: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: Request, ...args: any[]) =>
      handler(
        request,
        {
          user: { id: "user-1" },
          session: { activeOrganizationId: "org-1" },
        },
        ...args,
      ),
}));
vi.mock("lib/auth/permissions", () => ({
  canCreateAgent: mocks.canCreateAgent,
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgentById: mocks.selectAgentById,
    insertAgent: mocks.insertAgent,
    incrementAgentForkCount: mocks.incrementAgentForkCount,
  },
  agentInstallRepository: {
    getPublishedAgent: mocks.getPublishedAgent,
  },
}));
vi.mock("lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "agent-1" }) };

/** Shape returned by selectAgentById (full Agent). */
const SHARED_SOURCE = {
  id: "agent-1",
  name: "Bug Hunter",
  description: "Hunts bugs",
  icon: { type: "emoji", value: "🐛" },
  userId: "user-2",
  instructions: {
    role: "QA",
    systemPrompt: "Find bugs.",
    knowledgeBases: [{ type: "kb", id: "kb-1", name: "KB" }],
    // Foreign file bindings — must never ride into the forker's copy.
    files: [{ storageKey: "uploads/user-2/notes.txt", filename: "notes.txt" }],
  },
  visibility: "public",
  presetId: null,
  model: "anthropic/claude-sonnet-5",
  forkCount: 0,
  forkedFromAgentId: null,
  galleryMetadata: null,
  publishedAt: new Date("2026-11-01T00:00:00Z"),
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  userName: "Author",
  isBookmarked: false,
};

const FORK = { ...SHARED_SOURCE, id: "agent-fork", userId: "user-1" };

function request() {
  return new Request("https://void.example/api/agent/agent-1/fork", {
    method: "POST",
  });
}

describe("POST /api/agent/[id]/fork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCreateAgent.mockResolvedValue(true);
    mocks.selectAgentById.mockResolvedValue(null);
    mocks.getPublishedAgent.mockResolvedValue(null);
    mocks.insertAgent.mockResolvedValue(FORK);
    mocks.incrementAgentForkCount.mockResolvedValue(undefined);
  });

  it("403s before any read when the user cannot create agents", async () => {
    mocks.canCreateAgent.mockResolvedValue(false);

    const response = await POST(request() as never, context);

    expect(response.status).toBe(403);
    expect(mocks.selectAgentById).not.toHaveBeenCalled();
  });

  it("404s when no read path can see the agent", async () => {
    const response = await POST(request() as never, context);

    expect(response.status).toBe(404);
    expect(mocks.insertAgent).not.toHaveBeenCalled();
  });

  it("copies an org-shared agent into the caller's account", async () => {
    mocks.selectAgentById.mockResolvedValue(SHARED_SOURCE);

    const response = await POST(request() as never, context);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.agent.id).toBe("agent-fork");
    expect(mocks.insertAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bug Hunter",
        userId: "user-1",
        organizationId: "org-1",
        visibility: "private",
        model: "anthropic/claude-sonnet-5",
        forkedFromAgentId: "agent-1",
        galleryMetadata: {
          forkedFrom: {
            agentId: "agent-1",
            name: "Bug Hunter",
            userName: "Author",
          },
        },
      }),
    );
    // The author's file bindings are grants against their storage — dropped.
    const inserted = mocks.insertAgent.mock.calls[0][0];
    expect(inserted.instructions.files).toBeUndefined();
    expect(inserted.instructions.systemPrompt).toBe("Find bugs.");
    expect(mocks.selectAgentById).toHaveBeenCalledWith(
      "agent-1",
      "user-1",
      "org-1",
    );
    // The counter must never fail the fork; assert it was counted.
    expect(mocks.incrementAgentForkCount).toHaveBeenCalledWith("agent-1");
  });

  it("falls back to the published gallery agent (cross-org) when the org read misses", async () => {
    mocks.getPublishedAgent.mockResolvedValue({
      ...SHARED_SOURCE,
      // Entity row: author name is not part of the published read.
      userName: undefined,
    });

    const response = await POST(request() as never, context);

    expect(response.status).toBe(201);
    const inserted = mocks.insertAgent.mock.calls[0][0];
    expect(inserted.userId).toBe("user-1");
    expect(inserted.galleryMetadata.forkedFrom.userName).toBeNull();
    expect(inserted.galleryMetadata.forkedFrom.name).toBe("Bug Hunter");
  });

  it("fails as 500 (no partial rows) when the insert throws", async () => {
    mocks.selectAgentById.mockResolvedValue(SHARED_SOURCE);
    mocks.insertAgent.mockRejectedValue(new Error("db down"));

    const response = await POST(request() as never, context);

    expect(response.status).toBe(500);
    expect(mocks.incrementAgentForkCount).not.toHaveBeenCalled();
  });
});
