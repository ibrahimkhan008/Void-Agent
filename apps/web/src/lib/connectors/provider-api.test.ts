import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: undefined as any,
  where: undefined as any,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (column: string, value: unknown) => ({ op: "eq", column, value }),
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: {
    accessToken: "accessToken",
    refreshToken: "refreshToken",
    isConnected: "isConnected",
    isPaused: "isPaused",
    tokenExpiresAt: "tokenExpiresAt",
    userId: "userId",
    provider: "provider",
    id: "id",
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.where = condition;
          return { limit: async () => (mocks.row ? [mocks.row] : []) };
        },
      }),
    }),
  },
}));

import { encrypt } from "lib/security/encryption";
import {
  ConnectorApiError,
  callConnectorApi,
  getConnectorAccessToken,
} from "./provider-api";

const KEY = "0123456789abcdef0123456789abcdef";
const encryptedToken = (userId: string, provider: string, token: string) =>
  `enc:v1:${encrypt(JSON.stringify({ userId, provider, kind: "access", token }))}`;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_MASTER_KEY = KEY;
  mocks.row = {
    accessToken: encryptedToken("owner-1", "gmail", "private-token"),
    refreshToken: null,
    isConnected: true,
    isPaused: false,
    tokenExpiresAt: null,
  };
});

describe("connector provider token boundary", () => {
  it("selects an owner/provider-scoped connector row and decrypts only its bound token", async () => {
    await expect(getConnectorAccessToken("owner-1", "gmail")).resolves.toBe(
      "private-token",
    );
    expect(mocks.where).toEqual({
      conditions: [
        { op: "eq", column: "userId", value: "owner-1" },
        { op: "eq", column: "provider", value: "gmail" },
      ],
    });
  });

  it("rejects encrypted token envelopes belonging to another user or provider", async () => {
    mocks.row.accessToken = encryptedToken(
      "owner-2",
      "gmail",
      "another-users-token",
    );
    await expect(
      getConnectorAccessToken("owner-1", "gmail"),
    ).rejects.toBeInstanceOf(ConnectorApiError);
    mocks.row.accessToken = encryptedToken(
      "owner-1",
      "github",
      "wrong-provider-token",
    );
    await expect(
      getConnectorAccessToken("owner-1", "gmail"),
    ).rejects.toBeInstanceOf(ConnectorApiError);
  });

  it("calls only the fixed Google API origin with the scoped bearer token and rejects URL overrides", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        return Response.json({ messages: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    await callConnectorApi("owner-1", "gmail", "/gmail/v1/users/me/messages", {
      query: { q: "from:test@example.test", maxResults: 5 },
    });
    const [url, init] = calls[0]!;
    expect(new URL(String(url)).origin).toBe("https://gmail.googleapis.com");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer private-token",
    );
    await expect(
      callConnectorApi("owner-1", "gmail", "https://evil.example/path"),
    ).rejects.toBeInstanceOf(ConnectorApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it.each([
    ["gmail", "https://gmail.googleapis.com", "/gmail/v1/users/me/messages"],
    ["google-drive", "https://www.googleapis.com", "/drive/v3/files"],
    [
      "google-calendar",
      "https://www.googleapis.com",
      "/calendar/v3/calendars/primary/events",
    ],
    ["github", "https://api.github.com", "/user/repos"],
    ["outlook", "https://graph.microsoft.com", "/v1.0/me/messages"],
    ["teams", "https://graph.microsoft.com", "/v1.0/me/chats"],
    ["slack", "https://slack.com", "/api/conversations.list"],
    ["notion", "https://api.notion.com", "/v1/search"],
    ["asana", "https://app.asana.com", "/api/1.0/tasks"],
    ["clickup", "https://api.clickup.com", "/api/v2/list/7/task"],
    ["linear", "https://api.linear.app", "/graphql"],
    [
      "jira",
      "https://api.atlassian.com",
      "/ex/jira/1324a887-45db-1bf4-1e99-ef0ff456d421/rest/api/3/project/search",
    ],
  ] as const)(
    "keeps %s requests on the fixed provider origin",
    async (provider, origin, path) => {
      mocks.row.accessToken = encryptedToken(
        "owner-1",
        provider,
        `${provider}-private-token`,
      );
      const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          calls.push([input, init]);
          return Response.json({ ok: true });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      try {
        await callConnectorApi("owner-1", provider, path);
        const [url, init] = calls[0]!;
        expect(new URL(String(url)).origin).toBe(origin);
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${provider}-private-token`,
        );
        expect(init?.redirect).toBe("error");
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("derives Zendesk's host from validated server configuration, never user input", async () => {
    process.env.ZENDESK_SUBDOMAIN = "example-support";
    mocks.row.accessToken = encryptedToken(
      "owner-1",
      "zendesk",
      "zendesk-private-token",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ ticket: { id: "123" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await callConnectorApi("owner-1", "zendesk", "/api/v2/tickets/123.json");
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).origin).toBe(
        "https://example-support.zendesk.com",
      );
      expect(
        new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization"),
      ).toBe("Bearer zendesk-private-token");
      process.env.ZENDESK_SUBDOMAIN = "example-support.attacker.invalid";
      await expect(
        callConnectorApi("owner-1", "zendesk", "/api/v2/tickets/123.json"),
      ).rejects.toBeInstanceOf(ConnectorApiError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses Freshdesk's fixed configured host and API-key Basic authentication", async () => {
    process.env.FRESHDESK_SUBDOMAIN = "support-tenant";
    mocks.row.accessToken = encryptedToken(
      "owner-1",
      "freshdesk",
      "freshdesk-api-key",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ tickets: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await callConnectorApi("owner-1", "freshdesk", "/api/v2/tickets");
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).origin).toBe(
        "https://support-tenant.freshdesk.com",
      );
      expect(
        new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization"),
      ).toBe(`Basic ${Buffer.from("freshdesk-api-key:X").toString("base64")}`);
      process.env.FRESHDESK_SUBDOMAIN = "support-tenant.example.invalid";
      await expect(
        callConnectorApi("owner-1", "freshdesk", "/api/v2/tickets"),
      ).rejects.toBeInstanceOf(ConnectorApiError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
