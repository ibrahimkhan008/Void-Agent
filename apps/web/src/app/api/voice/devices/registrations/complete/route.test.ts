import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rate: vi.fn(), complete: vi.fn() }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceCustomRepository: { completeOtaRegistration: mocks.complete },
}));
import { POST } from "./route";

const request = (
  payload: unknown = {
    registrationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    code: "012345",
    bootstrapSecret: "a".repeat(43),
  },
) =>
  new Request("https://void.test/api/voice/devices/registrations/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("complete OTA voice registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.complete.mockResolvedValue({
      deviceId: "device-1",
      token: "nvdev_live_secret",
    });
  });

  it("returns the one-time credential only after valid registration proof", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      deviceId: "device-1",
      token: "nvdev_live_secret",
      status: "completed",
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "012345",
        bootstrapSecret: "a".repeat(43),
      }),
    );
  });

  it("rejects malformed proofs and rate-limits before credential delivery", async () => {
    expect(
      (
        await POST(
          request({ registrationId: "bad", code: "1", bootstrapSecret: "" }),
        )
      ).status,
    ).toBe(400);
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
