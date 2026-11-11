import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  hasSameOrigin: vi.fn(),
  getFinalizedSessionTranscript: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceCustomRepository: {
    getFinalizedSessionTranscript: mocks.getFinalizedSessionTranscript,
  },
}));
vi.mock("lib/voice/long-capture-summary", () => ({
  summarizeLongVoiceCapture: mocks.summarize,
}));

import { POST } from "./route";

const deviceId = "00000000-0000-4000-8000-000000000001";
const sessionId = "capture-123";
const params = Promise.resolve({ id: deviceId, sessionId });

function request() {
  return new Request(
    `https://app.test/api/voice/devices/${deviceId}/sessions/${sessionId}/summary`,
    { method: "POST", headers: { Origin: "https://app.test" } },
  );
}

describe("POST voice device capture summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
    mocks.getFinalizedSessionTranscript.mockResolvedValue({
      status: "completed",
      transcript: "A long capture transcript.",
    });
    mocks.summarize.mockResolvedValue({
      title: "Meeting notes",
      summary: "The group discussed priorities.",
      actionItems: [],
      decisions: [],
      notes: [],
    });
  });

  it("requires a signed-in user and same-origin request", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request(), { params })).status).toBe(401);
    mocks.hasSameOrigin.mockReturnValueOnce(false);
    expect((await POST(request(), { params })).status).toBe(403);
    expect(mocks.getFinalizedSessionTranscript).not.toHaveBeenCalled();
  });

  it("limits summary requests per signed-in user", async () => {
    mocks.checkApiRateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request(), { params });
    expect(response.status).toBe(429);
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("does not summarize a missing, foreign-owner, or unfinalized capture", async () => {
    mocks.getFinalizedSessionTranscript.mockResolvedValueOnce(null);
    expect((await POST(request(), { params })).status).toBe(404);
    mocks.getFinalizedSessionTranscript.mockResolvedValueOnce({
      status: "not_finalized",
    });
    expect((await POST(request(), { params })).status).toBe(409);
    expect(mocks.summarize).not.toHaveBeenCalled();
    expect(mocks.getFinalizedSessionTranscript).toHaveBeenCalledWith({
      deviceId,
      userId: "owner-1",
      sessionId,
    });
  });

  it("returns a summary only after an explicit user POST and performs no persistence", async () => {
    const response = await POST(request(), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { title: "Meeting notes" },
    });
    expect(mocks.summarize).toHaveBeenCalledWith("A long capture transcript.");
    expect(mocks.getFinalizedSessionTranscript).toHaveBeenCalledOnce();
  });

  it("returns a generic error when the model cannot summarize", async () => {
    mocks.summarize.mockRejectedValueOnce(new Error("provider details"));
    const response = await POST(request(), { params });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not summarize this capture. Nothing was saved or executed.",
    });
  });
});
