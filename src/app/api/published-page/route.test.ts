import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectOwnerIdBySlug: vi.fn(),
  publish: vi.fn(),
  revokeBySlug: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  publishedPageRepository: {
    selectOwnerIdBySlug: mocks.selectOwnerIdBySlug,
    publish: mocks.publish,
    revokeBySlug: mocks.revokeBySlug,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));

import { PublishedPageQuotaError } from "lib/published-page/quota";
import { DELETE, POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const slug = `launch-${"a".repeat(24)}`;

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://app.example${path}`, {
    ...init,
    headers: { origin: "https://app.example", ...init.headers },
  });
}

describe("published page lifecycle API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId }, session: {} });
    mocks.rate.mockResolvedValue({ allowed: true });
  });

  it("publishes bounded HTML as a new private-owner capability", async () => {
    mocks.publish.mockResolvedValue({ slug, version: 1 });
    const response = await POST(
      request("/api/published-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Launch",
          html: "<html><body>Ready</body></html>",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      url: `/p/${slug}`,
      version: 1,
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: userId, title: "Launch" }),
    );
  });

  it("rejects foreign republish attempts without appending a version", async () => {
    mocks.selectOwnerIdBySlug.mockResolvedValue("another-user");
    const response = await POST(
      request("/api/published-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Update", html: "<p>new</p>", slug }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("requires same-origin mutations and authenticated revocation", async () => {
    const csrf = await POST(
      new Request("https://app.example/api/published-page", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ title: "x", html: "<p>x</p>" }),
      }),
    );
    expect(csrf.status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();

    mocks.revokeBySlug.mockResolvedValue(2);
    const revoked = await DELETE(
      request(`/api/published-page?slug=${slug}`, { method: "DELETE" }),
    );
    expect(revoked.status).toBe(200);
    expect(mocks.revokeBySlug).toHaveBeenCalledWith(slug, userId);
    expect(mocks.rate).toHaveBeenLastCalledWith({
      kind: "published-page-revoke",
      id: userId,
      limit: 10,
      windowMs: 60_000,
    });
  });

  it("rate-limits revocation before touching page state", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    const response = await DELETE(
      request(`/api/published-page?slug=${slug}`, { method: "DELETE" }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many revoke requests",
    });
    expect(mocks.revokeBySlug).not.toHaveBeenCalled();
  });

  it("rejects anonymous create and malformed input before persistence", async () => {
    mocks.getSession.mockResolvedValue(null);
    const anonymous = await POST(
      request("/api/published-page", { method: "POST", body: "{}" }),
    );
    expect(anonymous.status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: userId }, session: {} });
    const invalid = await POST(
      request("/api/published-page", { method: "POST", body: "{bad" }),
    );
    expect(invalid.status).toBe(400);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("returns a clear conflict when the owner snapshot quota is full", async () => {
    mocks.publish.mockRejectedValue(new PublishedPageQuotaError());
    const response = await POST(
      request("/api/published-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Launch", html: "<p>ready</p>" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("snapshot quota"),
    });
  });

  it("caps UTF-8 HTML bytes independently of character count", async () => {
    const response = await POST(
      request("/api/published-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Large",
          html: `é${"é".repeat(1_100_000)}`,
        }),
      }),
    );
    expect(response.status).toBe(413);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
