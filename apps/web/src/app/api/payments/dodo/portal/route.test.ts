import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  base: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/repository", () => ({
  dodoPaymentsRepository: { listSubscriptionsForUser: mocks.list },
}));
vi.mock("lib/const", () => ({ getBaseUrl: mocks.base }));
vi.mock("lib/payments/dodo", () => ({
  createDodoCustomerPortalSession: mocks.create,
  DodoPaymentsError: class extends Error {
    status = 503;
  },
}));

import { POST } from "./route";
const request = (origin = "https://app.test") =>
  new Request("https://app.test/api/payments/dodo/portal", {
    method: "POST",
    headers: { Origin: origin },
  });

describe("Dodo billing portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.list.mockResolvedValue([
      { userId: "owner", dodoCustomerId: "cus_owner", status: "active" },
    ]);
    mocks.create.mockResolvedValue({
      link: "https://customer.dodopayments.com/portal",
    });
    mocks.base.mockReturnValue("https://app.test");
  });
  it("uses only a customer ID from the authenticated user's stored subscriptions", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      "cus_owner",
      "https://app.test/profile",
    );
  });
  it("rejects unauthenticated and cross-origin requests before reading billing records", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("https://attacker.test"))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("does not accept caller-supplied customer IDs when there is no owned record", async () => {
    mocks.list.mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
