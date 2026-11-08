import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPreferences: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  userRepository: { getPreferences: mocks.getPreferences },
}));

import { GET, POST } from "./route";

const request = (method: string, origin = "https://app.test") =>
  new Request("https://app.test/api/onboarding/complete", {
    method,
    headers: { Origin: origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.getPreferences.mockResolvedValue({ onboarding: { step: "done" } });
});

afterEach(() => vi.unstubAllEnvs());

describe("onboarding completion cookie", () => {
  it("sets an HttpOnly same-site cookie and redirects to this origin root", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("onboarding_complete=1");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("refuses to mint a completion cookie before the database says done", async () => {
    mocks.getPreferences.mockResolvedValue({
      onboarding: { step: "connect_tools" },
    });
    const response = await GET(request("GET"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.test/onboarding",
    );
    expect(response.headers.get("set-cookie")).toBeNull();

    const post = await POST(request("POST"));
    expect(post.status).toBe(409);
    expect(post.headers.get("set-cookie")).toBeNull();
  });

  it("requires authentication and same-origin for the backfill request", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request("POST"))).status).toBe(401);
    expect((await POST(request("POST", "https://evil.test"))).status).toBe(403);
  });

  it("supports new-device cookie backfill without navigation", async () => {
    const response = await POST(request("POST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain(
      "onboarding_complete=1",
    );
  });
});
