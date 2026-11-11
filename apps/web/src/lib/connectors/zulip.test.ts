import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  decrypt: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.rows,
        }),
      }),
    }),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: {
    userId: "userId",
    provider: "provider",
    email: "email",
    accessToken: "accessToken",
    isConnected: "isConnected",
    isPaused: "isPaused",
    metadata: "metadata",
  },
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  decryptConnectorToken: mocks.decrypt,
}));
vi.mock("lib/connectors/provider-api", () => ({
  ConnectorApiError: class ConnectorApiError extends Error {},
}));

import {
  callZulipApi,
  getZulipCredential,
  normalizeZulipRealmUrl,
} from "./zulip";

const connectedRow = (overrides: Record<string, unknown> = {}) => ({
  email: "owner@example.test",
  accessToken: "enc:v1:sealed",
  isConnected: true,
  isPaused: false,
  metadata: { realmUrl: "https://chat.example.com", name: "Owner" },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [connectedRow()];
  mocks.decrypt.mockReturnValue("zulip-api-key");
  mocks.fetch.mockResolvedValue(
    Response.json({ result: "success", streams: [] }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("normalizeZulipRealmUrl", () => {
  it("pins plain HTTPS FQDN origins exactly", () => {
    expect(normalizeZulipRealmUrl("https://chat.example.com")).toBe(
      "https://chat.example.com",
    );
    expect(normalizeZulipRealmUrl("https://Chat.Example.COM/")).toBe(
      "https://chat.example.com",
    );
    expect(normalizeZulipRealmUrl("https://zulip.example.com/")).toBe(
      "https://zulip.example.com",
    );
  });

  it("rejects non-HTTPS, credential-embedded, ported, pathed, query, and fragment URLs", () => {
    expect(normalizeZulipRealmUrl("http://chat.example.com")).toBeNull();
    expect(
      normalizeZulipRealmUrl("https://owner:secret@chat.example.com"),
    ).toBeNull();
    expect(normalizeZulipRealmUrl("https://chat.example.com:8443")).toBeNull();
    expect(normalizeZulipRealmUrl("https://chat.example.com/api")).toBeNull();
    expect(normalizeZulipRealmUrl("https://chat.example.com/?x=1")).toBeNull();
    expect(normalizeZulipRealmUrl("https://chat.example.com/#frag")).toBeNull();
    expect(normalizeZulipRealmUrl("not a url")).toBeNull();
  });

  it("rejects IP literals, localhost, and single-label hosts", () => {
    expect(normalizeZulipRealmUrl("https://127.0.0.1")).toBeNull();
    expect(normalizeZulipRealmUrl("https://10.0.0.7")).toBeNull();
    expect(normalizeZulipRealmUrl("https://[::1]")).toBeNull();
    expect(normalizeZulipRealmUrl("https://localhost")).toBeNull();
    expect(normalizeZulipRealmUrl("https://intranet")).toBeNull();
  });
});

describe("getZulipCredential", () => {
  it("returns the stored pinned realm with decrypted owner-scoped credentials", async () => {
    const credential = await getZulipCredential("zulip-owner");
    expect(credential).toEqual({
      realmUrl: "https://chat.example.com",
      email: "owner@example.test",
      apiKey: "zulip-api-key",
    });
    expect(mocks.decrypt).toHaveBeenCalledWith(
      "zulip-owner",
      "zulip",
      "access",
      "enc:v1:sealed",
    );
  });

  it("fails closed when the stored realm is missing, downgraded, ported, or pathed", async () => {
    mocks.rows = [connectedRow({ metadata: {} })];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not pinned",
    );
    mocks.rows = [
      connectedRow({ metadata: { realmUrl: "http://chat.example.com" } }),
    ];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not pinned",
    );
    mocks.rows = [
      connectedRow({ metadata: { realmUrl: "https://chat.example.com:8443" } }),
    ];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not pinned",
    );
    mocks.rows = [
      connectedRow({
        metadata: { realmUrl: "https://chat.example.com/realm" },
      }),
    ];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not pinned",
    );
  });

  it("fails closed when the user is not connected, paused, or lacks decryptable credentials", async () => {
    mocks.rows = [];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not connected",
    );
    mocks.rows = [connectedRow({ isConnected: false })];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not connected",
    );
    mocks.rows = [connectedRow({ isPaused: true })];
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "not connected",
    );
    mocks.rows = [connectedRow()];
    mocks.decrypt.mockReturnValue(null);
    await expect(getZulipCredential("zulip-owner")).rejects.toThrow(
      "credentials are unavailable",
    );
  });
});

describe("callZulipApi", () => {
  it("dispatches only to the pinned realm origin with Basic auth and redirect refusal", async () => {
    await callZulipApi("zulip-owner", "/api/v1/streams");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://chat.example.com/api/v1/streams");
    expect(url.origin).toBe("https://chat.example.com");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("owner@example.test:zulip-api-key").toString("base64")}`,
    );
  });

  it("sends writes as JSON to the pinned messages endpoint and rejects API-level failures", async () => {
    await callZulipApi("zulip-owner", "/api/v1/messages", {
      method: "POST",
      body: { type: "stream", to: "general", topic: "news", content: "hello" },
    });
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://chat.example.com/api/v1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      type: "stream",
      to: "general",
      topic: "news",
      content: "hello",
    });
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ result: "error", msg: "detailed provider message" }),
    );
    await expect(
      callZulipApi("zulip-owner", "/api/v1/streams"),
    ).rejects.toThrow("Zulip request failed");
    const [failedUrl] = mocks.fetch.mock.calls[1] as [URL, RequestInit];
    expect(failedUrl.origin).toBe("https://chat.example.com");
  });

  it("rejects HTTP error statuses with a generic message", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ result: "error" }, { status: 401 }),
    );
    await expect(
      callZulipApi("zulip-owner", "/api/v1/streams"),
    ).rejects.toThrow("Zulip request failed (401)");
  });
});
