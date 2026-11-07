import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  list: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/cockpit/seo", () => ({ listOpenSeoServers: mocks.list }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.list.mockResolvedValue([
    { id: "server-1", name: "OpenSEO", connected: true },
  ]);
});

describe("SEO Navigator MCP server list", () => {
  it("returns only the server choices supplied by the owner-filtered resolver", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      servers: [{ id: "server-1", name: "OpenSEO", connected: true }],
    });
    expect(mocks.list).toHaveBeenCalledWith("user-1");
  });
  it("requires authentication and fails closed on rate-limit outage", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    mocks.rate.mockRejectedValueOnce(new Error("cache down"));
    expect((await GET()).status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
