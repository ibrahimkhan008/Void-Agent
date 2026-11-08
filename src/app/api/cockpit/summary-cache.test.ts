import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkApiRateLimit: vi.fn(),
  resolveStripeScope: vi.fn(),
  loadWebsiteSummary: vi.fn(),
  loadSeoSummary: vi.fn(),
  loadRevolutSummary: vi.fn(),
  loadSuperlogSummary: vi.fn(),
  publicWebsiteError: vi.fn(),
  publicSeoError: vi.fn(),
  publicRevolutError: vi.fn(),
  publicSuperlogError: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/cockpit/access", () => ({
  resolveStripeScope: mocks.resolveStripeScope,
}));
vi.mock("lib/cockpit/website", () => ({
  loadWebsiteSummary: mocks.loadWebsiteSummary,
  publicWebsiteError: mocks.publicWebsiteError,
}));
vi.mock("lib/cockpit/seo", () => ({
  loadSeoSummary: mocks.loadSeoSummary,
  publicSeoError: mocks.publicSeoError,
}));
vi.mock("lib/cockpit/revolut", () => ({
  loadRevolutSummary: mocks.loadRevolutSummary,
  publicRevolutError: mocks.publicRevolutError,
}));
vi.mock("lib/cockpit/superlog", () => ({
  loadSuperlogSummary: mocks.loadSuperlogSummary,
  publicSuperlogError: mocks.publicSuperlogError,
}));

import { GET as getRevolutSummary } from "./revolut/summary/route";
import { GET as getSeoSummary } from "./seo/summary/route";
import { GET as getSuperlogSummary } from "./superlog/summary/route";
import { GET as getWebsiteSummary } from "./website/summary/route";

const routes = [
  ["website", getWebsiteSummary, "loadWebsiteSummary"],
  ["seo", getSeoSummary, "loadSeoSummary"],
  ["revolut", getRevolutSummary, "loadRevolutSummary"],
  ["superlog", getSuperlogSummary, "loadSuperlogSummary"],
] as const;

function request(path: string) {
  return new Request(`https://app.test/api/cockpit/${path}/summary`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.resolveStripeScope.mockResolvedValue({
    ok: true,
    canManage: true,
    scope: { userId: "user-1", teamId: null },
  });
  mocks.loadWebsiteSummary.mockResolvedValue(null);
  mocks.loadSeoSummary.mockResolvedValue(null);
  mocks.loadRevolutSummary.mockResolvedValue(null);
  mocks.loadSuperlogSummary.mockResolvedValue(null);
  mocks.publicWebsiteError.mockReturnValue("Unable to load website analytics.");
  mocks.publicSeoError.mockReturnValue("Unable to load SEO data.");
  mocks.publicRevolutError.mockReturnValue("Unable to load Revolut data.");
  mocks.publicSuperlogError.mockReturnValue("Unable to load Superlog data.");
});

describe.each(routes)(
  "%s summary cache policy",
  (_name, handler, loaderName) => {
    it("marks successful, missing-connection, and unauthorized responses private/no-store", async () => {
      const loader = mocks[loaderName];
      loader.mockResolvedValueOnce({ summary: true });
      const success = await handler(request(_name));
      expect(success.status).toBe(200);
      expect(success.headers.get("cache-control")).toBe("private, no-store");

      const missing = await handler(request(_name));
      expect(missing.status).toBe(404);
      expect(missing.headers.get("cache-control")).toBe("private, no-store");

      mocks.getSession.mockResolvedValueOnce(null);
      const unauthorized = await handler(request(_name));
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers.get("cache-control")).toBe(
        "private, no-store",
      );
    });
  },
);
