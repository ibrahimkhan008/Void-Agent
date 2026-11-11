import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inserted: undefined as any,
  allowed: true,
  encryption: true,
  fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({}),
  ),
  encrypted: vi.fn(() => "enc:v1:sealed"),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: any) => (request: any) =>
    handler(request, { user: { id: "owner-1" } }),
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  encryptConnectorToken: mocks.encrypted,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: () => mocks.encryption,
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

const request = (
  body: Record<string, unknown> = {
    realmUrl: "https://chat.example.com",
    email: "owner@example.test",
    apiKey: "A".repeat(32),
  },
  origin = "https://void.example",
) =>
  new NextRequest("https://void.example/api/connectors/zulip/credentials", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = undefined;
  mocks.allowed = true;
  mocks.encryption = true;
  mocks.fetch.mockResolvedValue(
    Response.json({
      result: "success",
      msg: "",
      user_id: 7,
      email: "owner@example.test",
      full_name: "Realm Owner",
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("POST /api/connectors/zulip/credentials", () => {
  it("verifies the API key against the pinned realm and stores only encrypted owner-scoped credentials", async () => {
    const response = await POST(request() as any);
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [fetched, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(fetched).toBe("https://chat.example.com/api/v1/users/me");
    expect(new URL(fetched).origin).toBe("https://chat.example.com");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`owner@example.test:${"A".repeat(32)}`).toString("base64")}`,
    );
    expect(mocks.inserted).toMatchObject({
      userId: "owner-1",
      provider: "zulip",
      email: "owner@example.test",
      accessToken: "enc:v1:sealed",
      isConnected: true,
      metadata: { name: "Realm Owner", realmUrl: "https://chat.example.com" },
    });
    expect(JSON.stringify(mocks.inserted)).not.toContain("A".repeat(32));
    expect(mocks.encrypted).toHaveBeenCalledWith(
      "owner-1",
      "zulip",
      "access",
      "A".repeat(32),
    );
    const result = await response.json();
    expect(JSON.stringify(result)).not.toContain("A".repeat(32));
  });

  it("pins the exact https realm host at save, normalizing case and trailing slash", async () => {
    const response = await POST(
      request({
        realmUrl: "https://Chat.Example.COM/",
        email: "owner@example.test",
        apiKey: "A".repeat(32),
      }) as any,
    );
    expect(response.status).toBe(200);
    expect(mocks.inserted.metadata.realmUrl).toBe("https://chat.example.com");
    const [fetched] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(new URL(fetched).origin).toBe("https://chat.example.com");
  });

  it("rejects un-pinnable realm hosts (http, credentials, ports, IPs, localhost) before any request", async () => {
    for (const realmUrl of [
      "http://chat.example.com",
      "https://owner:key@chat.example.com",
      "https://chat.example.com:8443",
      "https://127.0.0.1",
      "https://localhost",
      "https://chat.example.com/realm",
      "not a url",
    ]) {
      const response = await POST(
        request({
          realmUrl,
          email: "owner@example.test",
          apiKey: "A".repeat(32),
        }) as any,
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.inserted).toBeUndefined();
  });

  it("rejects cross-origin, rate-limited, unencrypted, malformed, and unverifiable requests without persistence", async () => {
    expect(
      (await POST(request(undefined, "https://attacker.example") as any))
        .status,
    ).toBe(403);
    mocks.allowed = false;
    expect(((await POST(request())) as any).status).toBe(429);
    mocks.allowed = true;
    mocks.encryption = false;
    expect(((await POST(request())) as any).status).toBe(503);
    mocks.encryption = true;
    expect(
      (await POST(request({ realmUrl: "https://chat.example.com" }) as any))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            realmUrl: "https://chat.example.com",
            email: "owner@example.test",
            apiKey: "short",
          }) as any,
        )
      ).status,
    ).toBe(400);
    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        { result: "error", msg: "bad key", id: 1 },
        { status: 401 },
      ),
    );
    expect(((await POST(request())) as any).status).toBe(401);
    mocks.fetch.mockResolvedValueOnce(Response.json({ result: "success" }));
    expect(((await POST(request())) as any).status).toBe(401);
    expect(mocks.inserted).toBeUndefined();
  });

  it("redacts verification failures and does not persist", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("secret provider response"));
    const response = await POST(request() as any);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Zulip connection could not be completed",
    });
    expect(mocks.inserted).toBeUndefined();
  });
});
