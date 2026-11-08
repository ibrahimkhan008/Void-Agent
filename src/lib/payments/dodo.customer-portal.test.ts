import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: { getConfig: vi.fn(async () => null) },
}));
vi.mock("lib/security/encryption", () => ({
  decrypt: vi.fn(() => {
    throw new Error("not configured");
  }),
}));

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

describe("createDodoCustomerPortalSession", () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_API_KEY = "server-test-key";
    process.env.DODO_ENVIRONMENT = "test_mode";
    delete process.env.DODO_WEBHOOK_SECRET;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("creates a no-store portal session for the server-selected customer", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            link: "https://customer.dodopayments.com/portal/signed",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { createDodoCustomerPortalSession } = await import("./dodo");
    const result = await createDodoCustomerPortalSession(
      "cus_owned_123",
      "https://app.example/profile?portal=returned",
    );

    expect(result).toEqual({
      link: "https://customer.dodopayments.com/portal/signed",
    });
    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.toString()).toBe(
      "https://test.dodopayments.com/customers/cus_owned_123/customer-portal/session?return_url=https%3A%2F%2Fapp.example%2Fprofile%3Fportal%3Dreturned",
    );
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer server-test-key",
      Accept: "application/json",
    });
    expect(init.body).toBeUndefined();
  });

  it("rejects invalid customer IDs before making a provider request", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { createDodoCustomerPortalSession } = await import("./dodo");
    await expect(
      createDodoCustomerPortalSession("cus/attacker"),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS or non-link provider responses", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ link: "http://attacker.example/fake" }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const { createDodoCustomerPortalSession } = await import("./dodo");
    await expect(
      createDodoCustomerPortalSession("cus_owned_123"),
    ).rejects.toMatchObject({ status: 200 });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ other: "value" }), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(
      createDodoCustomerPortalSession("cus_owned_123"),
    ).rejects.toThrow("missing customer portal link");
  });

  it("returns a generic provider failure without propagating the response body", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("private provider body", { status: 500 }),
    ) as unknown as typeof fetch;
    const { createDodoCustomerPortalSession } = await import("./dodo");
    await expect(
      createDodoCustomerPortalSession("cus_owned_123"),
    ).rejects.toMatchObject({ status: 500, body: "" });
  });
});
