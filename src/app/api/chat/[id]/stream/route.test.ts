import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectThread: vi.fn(),
  getStreamContext: vi.fn(),
  getActiveStream: vi.fn(),
  clearActiveStream: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  chatRepository: { selectThread: mocks.selectThread },
}));
vi.mock("lib/ai/chat-stream-context", () => ({
  getStreamContext: mocks.getStreamContext,
  getActiveStream: mocks.getActiveStream,
  clearActiveStream: mocks.clearActiveStream,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
import { GET, HEAD } from "./route";
const threadId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: threadId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.selectThread.mockResolvedValue({ id: threadId, userId: "user-1" });
  mocks.clearActiveStream.mockResolvedValue(undefined);
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  mocks.getStreamContext.mockReturnValue({
    resumeExistingStream: vi.fn().mockResolvedValue(null),
  });
  mocks.getActiveStream.mockResolvedValue("stream-1");
});

describe("chat resumable stream endpoint", () => {
  it("requires the signed-in thread owner for HEAD and GET", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await HEAD(new Request("https://void.test"), params)).status).toBe(
      401,
    );
    mocks.getSession.mockResolvedValue({ user: { id: "user-2" } });
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      404,
    );
    expect(mocks.getActiveStream).not.toHaveBeenCalled();
  });

  it("rate-limits reconnect probes before loading the thread and gives a retry delay", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 12_500 });
    const response = await GET(new Request("https://void.test"), params);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "chat-stream-resume",
      id: "user-1",
      limit: 120,
      windowMs: 60_000,
    });
    expect(mocks.selectThread).not.toHaveBeenCalled();
    expect(mocks.getActiveStream).not.toHaveBeenCalled();
  });

  it("returns no content when no resumable context or active buffer exists", async () => {
    mocks.getStreamContext.mockReturnValue(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(
      204,
    );
    mocks.getStreamContext.mockReturnValue({});
    mocks.getActiveStream.mockResolvedValue(null);
    expect((await HEAD(new Request("https://void.test"), params)).status).toBe(
      204,
    );
  });

  it("resumes an active buffer using the AI UI-message stream headers", async () => {
    const body = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("data: done\n\n");
        controller.close();
      },
    });
    mocks.getStreamContext.mockReturnValue({
      resumeExistingStream: vi.fn().mockResolvedValue(body),
    });
    const response = await GET(new Request("https://void.test"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  });

  it("retires only the stale pointer when its resumable buffer has expired", async () => {
    const resumeExistingStream = vi.fn().mockResolvedValue(null);
    mocks.getStreamContext.mockReturnValue({ resumeExistingStream });

    const response = await GET(new Request("https://void.test"), params);

    expect(response.status).toBe(204);
    expect(resumeExistingStream).toHaveBeenCalledWith("stream-1");
    expect(mocks.clearActiveStream).toHaveBeenCalledWith(threadId, "stream-1");
  });
});
