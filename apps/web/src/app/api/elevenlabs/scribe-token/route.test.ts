import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSessionMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

const singleUseCreateMock = vi.fn();

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    tokens = {
      singleUse: {
        create: (...args: unknown[]) => singleUseCreateMock(...args),
      },
    };
  },
}));

const route = await import("./route");

const makeRequest = () =>
  new NextRequest("http://localhost/api/elevenlabs/scribe-token", {
    method: "POST",
  });

describe("POST /api/elevenlabs/scribe-token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user_1" } });
    process.env.ELEVENLABS_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await route.POST(makeRequest());
    expect(response.status).toBe(401);
    expect(singleUseCreateMock).not.toHaveBeenCalled();
  });

  it("returns 503 when ELEVENLABS_API_KEY is not configured", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const response = await route.POST(makeRequest());
    expect(response.status).toBe(503);
    expect(singleUseCreateMock).not.toHaveBeenCalled();
  });

  it("mints a single-use realtime_scribe token for signed-in users", async () => {
    singleUseCreateMock.mockResolvedValue({ token: "scribe-token" });
    const response = await route.POST(makeRequest());

    expect(response.status).toBe(200);
    expect(singleUseCreateMock).toHaveBeenCalledWith("realtime_scribe");
    expect(await response.json()).toEqual({ token: "scribe-token" });
  });

  it("returns 500 when token generation fails", async () => {
    singleUseCreateMock.mockRejectedValue(new Error("boom"));
    const response = await route.POST(makeRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to generate token",
    });
  });
});
