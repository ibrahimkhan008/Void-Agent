import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  claim: vi.fn(),
  encryption: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: mocks.encryption,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceCustomRepository: { claimOtaRegistration: mocks.claim },
}));
import { POST } from "./route";

const request = (origin = "https://void.test") =>
  new Request("https://void.test/api/voice/devices/registrations/claim", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ code: "012345" }),
  });

describe("claim OTA voice registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.encryption.mockReturnValue(true);
    mocks.claim.mockResolvedValue({
      id: "registration-1",
      displayName: "Desk",
    });
  });

  it("requires login, same origin, limits and encryption before claim", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("https://evil.test"))).status).toBe(403);
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    mocks.encryption.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims only with the supplied code and returns no device credential", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      registrationId: "registration-1",
      displayName: "Desk",
      status: "claimed",
    });
    expect(mocks.claim).toHaveBeenCalledWith({
      code: "012345",
      userId: "user-1",
      displayName: "Void-Agent Voice Device",
    });
  });
});
