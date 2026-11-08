import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockDodoPaymentsError extends Error {
    status: number;
    constructor(status: number) {
      super("mock provider failure");
      this.status = status;
    }
  }
  return {
    auth: vi.fn(),
    listSubscriptionsForUser: vi.fn(),
    createPortal: vi.fn(),
    rateLimit: vi.fn(),
    getBaseUrl: vi.fn(),
    MockDodoPaymentsError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ auth: { api: { getSession: mocks.auth } } }));
vi.mock("lib/db/repository", () => ({
  dodoPaymentsRepository: {
    listSubscriptionsForUser: mocks.listSubscriptionsForUser,
  },
}));
vi.mock("lib/payments/dodo", () => ({
  createDodoCustomerPortalSession: mocks.createPortal,
  DodoPaymentsError: mocks.MockDodoPaymentsError,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/const", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/const")>()),
  getBaseUrl: mocks.getBaseUrl,
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function request(origin = "https://app.example") {
  return new NextRequest("https://app.example/api/payments/dodo/portal", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: "cus_attacker_supplied" }),
  });
}

describe("POST /api/payments/dodo/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listSubscriptionsForUser.mockResolvedValue([
      {
        userId: "user-1",
        dodoCustomerId: "cus_owned_latest",
        status: "active",
      },
      {
        userId: "user-1",
        dodoCustomerId: "cus_owned_older",
        status: "cancelled",
      },
    ]);
    mocks.createPortal.mockResolvedValue({
      link: "https://customer.dodopayments.com/portal/signed",
    });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.getBaseUrl.mockReturnValue("https://app.example");
  });

  it("creates a portal session only for the customer stored on the caller's subscription", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.listSubscriptionsForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.createPortal).toHaveBeenCalledWith(
      "cus_owned_latest",
      "https://app.example/profile",
    );
    expect(mocks.createPortal).not.toHaveBeenCalledWith(
      "cus_attacker_supplied",
      expect.anything(),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      success: true,
      url: "https://customer.dodopayments.com/portal/signed",
    });
  });

  it("requires an authenticated same-origin request before data access", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);

    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.listSubscriptionsForUser).not.toHaveBeenCalled();
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("rate limits portal creation per user", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.listSubscriptionsForUser).not.toHaveBeenCalled();
  });

  it("uses a prior owned customer when there is no active subscription", async () => {
    mocks.listSubscriptionsForUser.mockResolvedValue([
      { userId: "user-1", dodoCustomerId: null, status: "pending" },
      {
        userId: "user-1",
        dodoCustomerId: "cus_owned_old",
        status: "cancelled",
      },
    ]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.createPortal).toHaveBeenCalledWith(
      "cus_owned_old",
      "https://app.example/profile",
    );
  });

  it("does not create a portal session when no customer is linked to the account", async () => {
    mocks.listSubscriptionsForUser.mockResolvedValue([
      { userId: "user-1", dodoCustomerId: null, status: "pending" },
    ]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "PORTAL_UNAVAILABLE",
    });
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("reports missing configuration and provider failures without exposing details", async () => {
    mocks.createPortal.mockRejectedValueOnce(
      new mocks.MockDodoPaymentsError(503),
    );
    expect((await POST(request())).status).toBe(503);

    mocks.createPortal.mockRejectedValueOnce(
      new Error("private provider details"),
    );
    const failed = await POST(request());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      success: false,
      error: "PORTAL_FAILED",
    });
  });

  it("requires a configured same-origin return URL", async () => {
    mocks.getBaseUrl.mockReturnValue("");
    expect((await POST(request())).status).toBe(500);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });
});
