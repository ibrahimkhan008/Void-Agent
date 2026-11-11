import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rate: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceCustomRepository: { createOtaRegistration: mocks.create },
}));
vi.mock("lib/voice/device-auth", () => ({
  authenticateVoiceDevice: mocks.auth,
}));
import { GET } from "./route";

describe("Xiaozhi OTA activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.create.mockResolvedValue({
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });
    mocks.auth.mockResolvedValue(null);
  });

  it("creates a bounded activation registration with a device-held proof", async () => {
    const response = await GET(
      new Request("https://void.test/api/voice/xiaozhi/ota", {
        headers: { "x-hardware-id": "device-1", "x-firmware-version": "1.2" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.activation).toMatchObject({
      challenge: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      timeout_ms: 600_000,
    });
    expect(result.activation.code).toMatch(/^\d{6}$/);
    expect(result.activation.bootstrap_secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceType: "m5stack_atom_echo_s3r",
        hardwareId: "device-1",
        firmwareVersion: "1.2",
      }),
    );
  });

  it("accepts the reference firmware metadata headers", async () => {
    await GET(
      new Request("https://void.test/api/voice/xiaozhi/ota", {
        headers: { "client-id": "chip-2", "user-agent": "ESP-IDF/0.1.0" },
      }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hardwareId: "chip-2",
        firmwareVersion: "0.1.0",
      }),
    );
  });

  it("does not create registrations when OTA rate limited or a supplied bearer is invalid", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect(
      (await GET(new Request("https://void.test/api/voice/xiaozhi/ota")))
        .status,
    ).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      (
        await GET(
          new Request("https://void.test/api/voice/xiaozhi/ota", {
            headers: { authorization: "Bearer invalid" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
