import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rate: vi.fn(), scope: vi.fn(), status: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rate }));
vi.mock("lib/cockpit/access", () => ({ resolveStripeScope: mocks.scope }));
vi.mock("lib/cockpit/seo", async () => {
  const { z } = await import("zod");
  return { getSeoConnectionStatus: mocks.status, saveSeoConnection: mocks.save, removeSeoConnection: mocks.remove, seoSubmitSchema: z.object({ kind: z.literal("dataforseo").optional(), login: z.string().optional(), password: z.string().optional(), domain: z.string().optional(), locationName: z.string().optional(), languageCode: z.string().optional() }).strict() };
});
import { DELETE, GET, POST } from "./route";
const TEAM = "00000000-0000-4000-8000-000000000001";
const request = (path: string, method = "GET", body?: unknown, origin = "https://void.test") => new Request(`https://void.test${path}`, { method, headers: { ...(method !== "GET" ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => { vi.clearAllMocks(); mocks.getSession.mockResolvedValue({ user: { id: "user-1" } }); mocks.rate.mockResolvedValue({ allowed: true }); mocks.scope.mockImplementation(async (userId: string, teamId: string | null) => ({ ok: true, canManage: true, scope: { userId, teamId } })); mocks.status.mockResolvedValue({ connected: true, credentialSet: true }); mocks.save.mockResolvedValue({ connected: true }); mocks.remove.mockResolvedValue(true); });
describe("SEO Cockpit connection API", () => {
  it("returns secret-free status and verifies team membership", async () => {
    const response = await GET(request(`/api/cockpit/seo/connection?teamId=${TEAM}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("password");
    expect(mocks.scope).toHaveBeenCalledWith("user-1", TEAM);
    mocks.scope.mockResolvedValueOnce({ ok: false });
    expect((await GET(request(`/api/cockpit/seo/connection?teamId=${TEAM}`))).status).toBe(403);
  });
  it("rejects cross-origin writes, non-manager writes, oversized bodies, and endpoint overrides", async () => {
    const payload = { teamId: TEAM, config: { kind: "dataforseo", login: "u", password: "p", domain: "example.com" } };
    expect((await POST(request("/api/cockpit/seo/connection", "POST", payload, "https://attacker.test"))).status).toBe(403);
    mocks.scope.mockResolvedValue({ ok: true, canManage: false, scope: { userId: "user-1", teamId: TEAM } });
    expect((await POST(request("/api/cockpit/seo/connection", "POST", payload))).status).toBe(403);
    mocks.scope.mockResolvedValue({ ok: true, canManage: true, scope: { userId: "user-1", teamId: TEAM } });
    expect((await POST(request("/api/cockpit/seo/connection", "POST", { ...payload, config: { ...payload.config, endpoint: "https://attacker.test" } }))).status).toBe(400);
    const huge = new Request("https://void.test/api/cockpit/seo/connection", { method: "POST", headers: { Origin: "https://void.test" }, body: "x".repeat(5_000) });
    expect((await POST(huge)).status).toBe(413); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires manager access to remove and removes only the selected scope", async () => {
    mocks.scope.mockResolvedValue({ ok: true, canManage: false, scope: { userId: "user-1", teamId: TEAM } });
    expect((await DELETE(request(`/api/cockpit/seo/connection?teamId=${TEAM}`, "DELETE"))).status).toBe(403);
    mocks.scope.mockResolvedValue({ ok: true, canManage: true, scope: { userId: "user-1", teamId: TEAM } });
    expect((await DELETE(request(`/api/cockpit/seo/connection?teamId=${TEAM}`, "DELETE"))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({ userId: "user-1", teamId: TEAM });
  });
  it("fails closed when rate-limit storage is unavailable", async () => {
    mocks.rate.mockRejectedValue(new Error("rate-limit store unavailable"));
    expect((await GET(request("/api/cockpit/seo/connection"))).status).toBe(503);
    expect((await POST(request("/api/cockpit/seo/connection", "POST", { config: {} }))).status).toBe(503);
    expect((await DELETE(request("/api/cockpit/seo/connection", "DELETE"))).status).toBe(503);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
