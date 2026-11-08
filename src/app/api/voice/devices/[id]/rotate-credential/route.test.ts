import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  rotateCredential: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/notifications/contracts", () => ({
  isSameOriginRequest: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceRepository: { rotateCredential: mocks.rotateCredential },
}));

import { POST } from "./route";

const deviceId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: deviceId }) };
const request = (origin = "https://app.example") =>
  new Request(
    `https://app.example/api/voice/devices/${deviceId}/rotate-credential`,
    {
      method: "POST",
      headers: { origin },
    },
  );

describe("POST /api/voice/devices/[id]/rotate-credential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "device-owner" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.rotateCredential.mockResolvedValue({
      device: { id: deviceId, displayName: "Kitchen Echo" },
      token: "nvdev_live_one-time-secret",
    });
  });

  it("returns a one-time token only after owner-scoped repository rotation", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      deviceId,
      displayName: "Kitchen Echo",
      token: "nvdev_live_one-time-secret",
    });
    expect(mocks.rotateCredential).toHaveBeenCalledWith(
      deviceId,
      "device-owner",
    );
  });

  it("rejects unauthenticated, cross-origin, malformed, and throttled requests", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request(), params)).status).toBe(401);

    mocks.sameOrigin.mockReturnValueOnce(false);
    expect(
      (await POST(request("https://attacker.example"), params)).status,
    ).toBe(403);

    expect(
      (await POST(request(), { params: Promise.resolve({ id: "bad-id" }) }))
        .status,
    ).toBe(404);

    mocks.rateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 4_000,
    });
    const limited = await POST(request(), params);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("4");
    expect(mocks.rotateCredential).not.toHaveBeenCalled();
  });

  it("does not disclose whether another user's device exists", async () => {
    mocks.rotateCredential.mockResolvedValueOnce(null);
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Device not found");
  });

  it("does not expose token details when hashing or persistence fails", async () => {
    mocks.rotateCredential.mockRejectedValueOnce(
      new Error("VOICE_DEVICE_TOKEN_PEPPER missing"),
    );
    const response = await POST(request(), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Could not rotate device credential",
    });
  });
});
