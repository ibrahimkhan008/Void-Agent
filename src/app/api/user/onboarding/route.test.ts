import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  updateOnboardingPreference: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  userRepository: {
    updateOnboardingPreference: mocks.updateOnboardingPreference,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));

import { POST } from "./route";

const request = (
  body: unknown = { step: "connect_tools" },
  origin = "https://app.test",
) =>
  new Request("https://app.test/api/user/onboarding", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.updateOnboardingPreference.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/user/onboarding", () => {
  it("stores only the authenticated user's setup step", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true,
      onboarding: { step: "connect_tools" },
    });
    expect(mocks.updateOnboardingPreference).toHaveBeenCalledWith("owner-1", {
      step: "connect_tools",
    });
  });

  it("generates completion time on the server and rejects client timestamps", async () => {
    const before = Date.now();
    const response = await POST(request({ step: "done" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.onboarding.step).toBe("done");
    expect(Date.parse(body.onboarding.completedAt)).toBeGreaterThanOrEqual(
      before,
    );
    expect(mocks.updateOnboardingPreference).toHaveBeenCalledWith(
      "owner-1",
      body.onboarding,
    );
    expect(
      (
        await POST(
          request({ step: "done", completedAt: "2026-01-01T00:00:00.000Z" }),
        )
      ).status,
    ).toBe(400);
  });

  it("rejects missing sessions, cross-origin requests, and unknown steps", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(undefined, "https://evil.test"))).status).toBe(
      403,
    );
    expect((await POST(request({ step: "arbitrary" }))).status).toBe(400);
    expect(mocks.updateOnboardingPreference).not.toHaveBeenCalled();
  });

  it("enforces the per-user update limit", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.updateOnboardingPreference).not.toHaveBeenCalled();
  });
});
