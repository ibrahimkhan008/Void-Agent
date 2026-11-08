import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  revoke: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  voiceDeviceRepository: { revoke: mocks.revoke },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));

import { DELETE } from "./route";

const deviceId = "11111111-1111-4111-8111-111111111111";

function request(origin = "https://app.test") {
  return new Request(`https://app.test/api/voice/devices/${deviceId}`, {
    method: "DELETE",
    headers: { Origin: origin },
  });
}

function context() {
  return { params: Promise.resolve({ id: deviceId }) };
}

describe("DELETE /api/voice/devices/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.revoke.mockResolvedValue(true);
  });

  it("requires authentication before checking origin or mutating a device", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.hasSameOrigin).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin revocation before rate or repository calls", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await DELETE(request("https://attacker.test"), context());
    expect(response.status).toBe(403);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("preserves owner-scoped revocation and rate limiting for same-origin requests", async () => {
    const response = await DELETE(request(), context());
    expect(response.status).toBe(200);
    expect(mocks.rate).toHaveBeenCalledWith({
      kind: "voice-device-revoke",
      id: "owner-1",
      limit: 20,
      windowMs: 60_000,
    });
    expect(mocks.revoke).toHaveBeenCalledWith(deviceId, "owner-1");
  });
});
