import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  voiceDeviceCustomRepository: { getOtaRegistrationForUser: mocks.read },
}));
import { GET } from "./route";

describe("GET OTA registration status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.read.mockResolvedValue({
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      status: "claimed",
      deviceId: "device-1",
      displayName: "Desk",
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it("scopes setup status to the signed-in owner", async () => {
    const response = await GET(
      new Request(
        "https://void.test/api/voice/devices/registrations/status?registrationId=f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "claimed",
      deviceId: "device-1",
      displayName: "Desk",
    });
    expect(mocks.read).toHaveBeenCalledWith(
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "user-1",
    );
  });

  it("does not disclose registrations to other users or accept invalid ids", async () => {
    mocks.read.mockResolvedValueOnce(null);
    expect(
      (
        await GET(
          new Request(
            "https://void.test/api/voice/devices/registrations/status?registrationId=f47ac10b-58cc-4372-a567-0e02b2c3d479",
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await GET(
          new Request(
            "https://void.test/api/voice/devices/registrations/status?registrationId=invalid",
          ),
        )
      ).status,
    ).toBe(400);
  });
});
