import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner-1" } } as { user: { id: string } } | null,
  loadTranscriptForOwner: vi.fn(),
  saveForOwnerIfTranscriptCurrent: vi.fn(),
  generateThreadInsights: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
}));

type MockSession = { user: { id: string } };
type MockContext = { params: Promise<{ id: string }> };
type MockHandler = (
  request: Request,
  session: MockSession,
  context: MockContext,
) => Promise<Response>;

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: unknown) => async (request: Request, context: MockContext) => {
      if (!mocks.session)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      return (handler as MockHandler)(request, mocks.session, context);
    },
}));
vi.mock("lib/ai/thread-insights", () => ({
  generateThreadInsights: mocks.generateThreadInsights,
}));
vi.mock("lib/db/pg/repositories/thread-insights-repository.pg", () => ({
  pgThreadInsightsRepository: {
    loadTranscriptForOwner: mocks.loadTranscriptForOwner,
    saveForOwnerIfTranscriptCurrent: mocks.saveForOwnerIfTranscriptCurrent,
  },
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const threadId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id: threadId }) };
const request = () =>
  new Request(`https://app.test/api/thread/${threadId}/insights`, {
    method: "POST",
    headers: { origin: "https://app.test" },
  });

describe("POST /api/thread/[id]/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "owner-1" } };
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.loadTranscriptForOwner.mockResolvedValue({
      title: "Thread",
      messages: [{ id: "m1" }],
      messageCount: 1,
      lastMessageId: "m1",
      transcriptHash: "hash-1",
    });
    mocks.generateThreadInsights.mockResolvedValue({
      summary: "A concise summary.",
      decisions: ["Use the existing schema."],
      actionItems: ["Add the migration."],
    });
    mocks.saveForOwnerIfTranscriptCurrent.mockResolvedValue({
      status: "saved",
      insights: {
        summary: "A concise summary.",
        decisions: ["Use the existing schema."],
        actionItems: ["Add the migration."],
        generatedAt: new Date("2026-11-11T00:00:00.000Z"),
        sourceMessageCount: 1,
        sourceLastMessageId: "m1",
        currentMessageCount: 1,
        currentLastMessageId: "m1",
      },
    });
  });

  it("generates only from the authenticated owner's transcript and persists with owner scope", async () => {
    const response = await POST(request() as never, context as never);
    expect(response.status).toBe(200);
    expect(mocks.loadTranscriptForOwner).toHaveBeenCalledWith(
      threadId,
      "owner-1",
    );
    expect(mocks.generateThreadInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread",
        totalMessageCount: 1,
        messages: [{ id: "m1" }],
      }),
    );
    expect(mocks.saveForOwnerIfTranscriptCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        userId: "owner-1",
        expectedLastMessageId: "m1",
        expectedTranscriptHash: "hash-1",
        sourceMessageCount: 1,
      }),
    );
    expect(await response.json()).toMatchObject({
      summary: "A concise summary.",
      sourceMessageCount: 1,
      sourceLastMessageId: "m1",
      currentMessageCount: 1,
      currentLastMessageId: "m1",
    });
  });

  it("returns 404 without generating for a thread not owned by the session user", async () => {
    mocks.loadTranscriptForOwner.mockResolvedValue(null);
    expect((await POST(request() as never, context as never)).status).toBe(404);
    expect(mocks.generateThreadInsights).not.toHaveBeenCalled();
    expect(mocks.saveForOwnerIfTranscriptCurrent).not.toHaveBeenCalled();
  });

  it("does not persist invalid model output", async () => {
    mocks.generateThreadInsights.mockRejectedValue(
      new Error("invalid insight schema"),
    );
    expect((await POST(request() as never, context as never)).status).toBe(502);
    expect(mocks.saveForOwnerIfTranscriptCurrent).not.toHaveBeenCalled();
  });

  it("returns conflict if the transcript changed before atomic persistence", async () => {
    mocks.saveForOwnerIfTranscriptCurrent.mockResolvedValue({
      status: "transcript_changed",
    });
    expect((await POST(request() as never, context as never)).status).toBe(409);
  });

  it("requires same-origin writes, throttles regeneration, and authenticates", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request() as never, context as never)).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request() as never, context as never)).status).toBe(429);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.session = null;
    expect((await POST(request() as never, context as never)).status).toBe(401);
    expect(mocks.loadTranscriptForOwner).not.toHaveBeenCalled();
  });
});
