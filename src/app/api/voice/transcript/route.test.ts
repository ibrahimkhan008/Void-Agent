import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rate: vi.fn(), selectThread: vi.fn(), upsertThread: vi.fn(), upsertMessage: vi.fn() }));
vi.mock("lib/voice/device-auth", () => ({ authenticateVoiceDevice: mocks.authenticate }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rate }));
vi.mock("lib/db/repository", () => ({ chatRepository: { selectThread: mocks.selectThread, upsertThread: mocks.upsertThread, upsertMessage: mocks.upsertMessage } }));

import { POST } from "./route";

const request = (body: unknown, authorization = "Bearer nvdev_live_valid") => new Request("https://local.test/api/voice/transcript", {
  method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body),
});
const input = { sessionId: "session-1", eventId: "event-1", text: "Turn on the lights", language: "en-US" };

describe("POST /api/voice/transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.selectThread.mockResolvedValue(null);
  });

  it("requires an active enrolled device", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it("applies per-device limits and validates the bounded body", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(request(input))).status).toBe(429);
    mocks.rate.mockResolvedValue({ allowed: true });
    expect((await POST(request({ ...input, deviceId: "spoofed" }))).status).toBe(400);
  });

  it("persists idempotent user-owned chat messages without executing commands", async () => {
    const response = await POST(request(input));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.action).toBe("saved_for_review");
    expect(mocks.upsertThread).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", title: "Voice: Turn on the lights" }));
    expect(mocks.upsertMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "user", metadata: expect.objectContaining({ source: "voice_device", deviceId: "device-1", eventId: "event-1" }) }));
  });

  it("refuses a deterministic thread collision owned by another user", async () => {
    mocks.selectThread.mockResolvedValue({ id: "existing", userId: "other-user" });
    expect((await POST(request(input)).then((r) => r.status))).toBe(403);
    expect(mocks.upsertMessage).not.toHaveBeenCalled();
  });
});
