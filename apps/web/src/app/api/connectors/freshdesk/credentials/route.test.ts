import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inserted: undefined as any,
  allowed: true,
  fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({}),
  ),
  origin: "https://support.freshdesk.com" as string | undefined,
  encrypted: vi.fn(() => "enc:v1:sealed"),
}));
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: any) => (request: any) =>
    handler(request, { user: { id: "owner-1" } }),
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  encryptConnectorToken: mocks.encrypted,
}));
vi.mock("lib/connectors/provider-api", () => ({
  getFreshdeskOrigin: () => mocks.origin,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: () => true,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: async () => ({ allowed: mocks.allowed }),
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: { userId: "userId", provider: "provider" },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: () => ({
      values: (value: unknown) => {
        mocks.inserted = value;
        return { onConflictDoUpdate: vi.fn(async () => undefined) };
      },
    }),
  },
}));

import { POST } from "./route";

const request = (apiKey = "A".repeat(32), origin = "https://void.example") =>
  new Request("https://void.example/api/connectors/freshdesk/credentials", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = undefined;
  mocks.allowed = true;
  mocks.origin = "https://support.freshdesk.com";
  mocks.fetch.mockResolvedValue(
    Response.json({ name: "Agent", email: "agent@example.test" }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("POST /api/connectors/freshdesk/credentials", () => {
  it("verifies API key against fixed configured Freshdesk host and stores only encrypted owner-bound token", async () => {
    const response = await POST(request() as any);
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://support.freshdesk.com/api/v2/agents/me",
      expect.objectContaining({ redirect: "error" }),
    );
    const headers = new Headers(mocks.fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`${"A".repeat(32)}:X`).toString("base64")}`,
    );
    expect(mocks.inserted).toMatchObject({
      userId: "owner-1",
      provider: "freshdesk",
      accessToken: "enc:v1:sealed",
      isConnected: true,
      metadata: { name: "Agent" },
    });
    expect(JSON.stringify(mocks.inserted)).not.toContain("A".repeat(32));
    expect(mocks.encrypted).toHaveBeenCalledWith(
      "owner-1",
      "freshdesk",
      "access",
      "A".repeat(32),
    );
    const result = await response.json();
    expect(JSON.stringify(result)).not.toContain("A".repeat(32));
  });

  it("rejects cross-origin, unconfigured, oversized and invalid credentials without persistence", async () => {
    expect(
      (await POST(request("A".repeat(32), "https://attacker.example") as any))
        .status,
    ).toBe(403);
    mocks.origin = undefined;
    expect((await POST(request() as any)).status).toBe(503);
    mocks.origin = "https://support.freshdesk.com";
    expect((await POST(request("short") as any)).status).toBe(400);
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ error: "bad key" }, { status: 401 }),
    );
    expect((await POST(request() as any)).status).toBe(401);
    expect(mocks.inserted).toBeUndefined();
  });

  it("redacts failures and does not persist when verification fails", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("secret provider response"));
    const response = await POST(request() as any);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Freshdesk connection could not be completed",
    });
    expect(mocks.inserted).toBeUndefined();
  });
});
