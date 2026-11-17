import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumedState: null as null | Record<string, unknown>,
  issuedState: vi.fn(),
  issuedPayload: undefined as Record<string, unknown> | undefined,
  consumeState: vi.fn(),
  values: undefined as Record<string, unknown> | undefined,
  conflict: undefined as Record<string, unknown> | undefined,
}));

vi.mock("lib/const", () => ({ getBaseUrl: () => "https://void.example" }));
vi.mock("server-only", () => ({}));
vi.mock("lib/connectors/oauth-state", () => ({
  issueConnectorOAuthState: mocks.issuedState,
  consumeConnectorOAuthState: mocks.consumeState,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.values = values;
        return {
          onConflictDoUpdate: (conflict: Record<string, unknown>) => {
            mocks.conflict = conflict;
            return Promise.resolve();
          },
        };
      },
    }),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: {
    userId: "userId",
    provider: "provider",
  },
}));

import {
  beginConnectorOAuth,
  buildPkceChallenge,
  decryptConnectorToken,
  finishConnectorOAuth,
} from "./oauth-flow";

const TOKEN_KEY = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.values = undefined;
  mocks.conflict = undefined;
  mocks.issuedPayload = undefined;
  process.env.ENCRYPTION_MASTER_KEY = TOKEN_KEY;
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  mocks.issuedState.mockImplementation(
    async (payload: Record<string, unknown>) => {
      mocks.issuedPayload = payload;
      return "signed-state-value";
    },
  );
  mocks.consumeState.mockImplementation(async () => mocks.consumedState);
  mocks.consumedState = {
    userId: "owner-1",
    provider: "gmail",
    redirectUri: "https://void.example/api/connectors/gmail/callback",
    verifier: "v".repeat(43),
  };
});

describe("connector OAuth", () => {
  it("starts Google OAuth with fixed callback, state, and S256 PKCE", async () => {
    const result = await beginConnectorOAuth("owner-1", "gmail");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.authUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://void.example/api/connectors/gmail/callback",
    );
    expect(url.searchParams.get("state")).toBe("signed-state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      buildPkceChallenge(mocks.issuedPayload?.verifier as string),
    );
    expect(mocks.issuedState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        provider: "gmail",
        redirectUri: "https://void.example/api/connectors/gmail/callback",
        verifier: expect.any(String),
      }),
    );
  });

  it("uses Jira 3LO with the fixed Atlassian origin and narrowly requested scopes", async () => {
    process.env.ATLASSIAN_CLIENT_ID = "jira-client";
    process.env.ATLASSIAN_CLIENT_SECRET = "jira-secret";
    const result = await beginConnectorOAuth("owner-1", "jira");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.authUrl);
    expect(url.origin).toBe("https://auth.atlassian.com");
    expect(url.searchParams.get("audience")).toBe("api.atlassian.com");
    expect(url.searchParams.get("scope")).toContain("write:jira-work");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("derives Zendesk endpoints only from a validated configured subdomain", async () => {
    process.env.ZENDESK_CLIENT_ID = "zendesk-client";
    process.env.ZENDESK_CLIENT_SECRET = "zendesk-secret";
    process.env.ZENDESK_SUBDOMAIN = "example-support";
    const result = await beginConnectorOAuth("owner-1", "zendesk");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.authUrl).origin).toBe(
      "https://example-support.zendesk.com",
    );
    process.env.ZENDESK_SUBDOMAIN = "example-support.attacker.invalid";
    expect(await beginConnectorOAuth("owner-1", "zendesk")).toMatchObject({
      ok: false,
    });
  });

  it.each([
    [
      "asana",
      "ASANA_CLIENT_ID",
      "ASANA_CLIENT_SECRET",
      "https://app.asana.com/-/oauth_authorize",
      "tasks:write",
    ],
    [
      "clickup",
      "CLICKUP_CLIENT_ID",
      "CLICKUP_CLIENT_SECRET",
      "https://app.clickup.com/api",
      "",
    ],
    [
      "linear",
      "LINEAR_CLIENT_ID",
      "LINEAR_CLIENT_SECRET",
      "https://linear.app/oauth/authorize",
      "write",
    ],
    [
      "productboard",
      "PRODUCTBOARD_CLIENT_ID",
      "PRODUCTBOARD_CLIENT_SECRET",
      "https://app.productboard.com/oauth2/authorize",
      "entities:write",
    ],
    [
      "gitlab",
      "GITLAB_CLIENT_ID",
      "GITLAB_CLIENT_SECRET",
      "https://gitlab.com/oauth/authorize",
      "read_api",
    ],
  ] as const)(
    "uses a fixed, encrypted OAuth profile for %s",
    async (provider, idKey, secretKey, authUrl, scope) => {
      process.env[idKey] = "provider-client-id";
      process.env[secretKey] = "provider-client-secret";
      const result = await beginConnectorOAuth("owner-1", provider);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const url = new URL(result.authUrl);
      expect(url.toString().startsWith(authUrl)).toBe(true);
      expect(url.searchParams.get("client_id")).toBe("provider-client-id");
      expect(url.searchParams.get("state")).toBe("signed-state-value");
      if (scope) expect(url.searchParams.get("scope")).toContain(scope);
      if (
        provider === "asana" ||
        provider === "linear" ||
        provider === "productboard" ||
        provider === "gitlab"
      ) {
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(mocks.issuedPayload?.verifier).toBeTypeOf("string");
      } else {
        expect(mocks.issuedPayload?.verifier).toBeUndefined();
      }
    },
  );

  it("fails closed when token encryption is not configured", async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    await expect(
      beginConnectorOAuth("owner-1", "gmail"),
    ).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
    expect(mocks.issuedState).not.toHaveBeenCalled();
  });

  it("exchanges a code, verifies account identity, and stores only owner-bound ciphertext", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (requests.length === 1) {
          return Response.json({
            access_token: "access-secret",
            refresh_token: "refresh-secret",
            expires_in: 3600,
            scope: "openid email",
          });
        }
        return Response.json({ email: "user@example.test", name: "Test User" });
      },
    );

    const result = await finishConnectorOAuth(
      "gmail",
      "bounded-auth-code",
      "signed-state-value",
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: true,
      email: "user@example.test",
      name: "Test User",
    });
    expect(requests).toHaveLength(2);
    expect(new URL(requests[0].url).origin).toBe(
      "https://oauth2.googleapis.com",
    );
    expect(requests[0].redirect).toBe("error");
    expect(await requests[0].text()).toContain("code_verifier");
    expect(mocks.values).toMatchObject({
      userId: "owner-1",
      provider: "gmail",
      email: "user@example.test",
      isConnected: true,
    });
    const stored = mocks.values?.accessToken as string;
    expect(stored).not.toContain("access-secret");
    expect(decryptConnectorToken("owner-1", "gmail", "access", stored)).toBe(
      "access-secret",
    );
    expect(
      decryptConnectorToken("owner-2", "gmail", "access", stored),
    ).toBeNull();
    expect(
      decryptConnectorToken("owner-1", "github", "access", stored),
    ).toBeNull();
    expect(mocks.conflict?.target).toEqual(["userId", "provider"]);
  });

  it("does not exchange codes for another provider or mismatched redirect", async () => {
    mocks.consumedState = {
      userId: "owner-1",
      provider: "github",
      redirectUri: "https://void.example/api/connectors/github/callback",
      verifier: "v".repeat(43),
    };
    const fetchMock = vi.fn();
    await expect(
      finishConnectorOAuth("gmail", "code", "state", fetchMock as typeof fetch),
    ).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized authorization code before consuming state or fetching", async () => {
    const fetchMock = vi.fn();
    await expect(
      finishConnectorOAuth(
        "gmail",
        "x".repeat(4097),
        "state",
        fetchMock as typeof fetch,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.consumeState).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redacts provider errors and does not persist rejected tokens", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: "invalid_grant",
          error_description: "sensitive provider detail",
        },
        { status: 400 },
      ),
    );
    const result = await finishConnectorOAuth(
      "gmail",
      "authorization-code",
      "state",
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: false,
      error: "Provider authorization failed",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.values).toBeUndefined();
  });

  it("rejects oversized identity responses without persisting a token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "ephemeral-token" }))
      .mockResolvedValueOnce(
        new Response("x".repeat(128 * 1024 + 1), {
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(
      finishConnectorOAuth(
        "gmail",
        "authorization-code",
        "state",
        fetchMock as typeof fetch,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: "Provider authorization could not be completed",
    });
    expect(mocks.values).toBeUndefined();
  });

  it("fails Slack user-token OAuth generically when provider marks response failed", async () => {
    process.env.SLACK_CLIENT_ID = "slack-id";
    process.env.SLACK_CLIENT_SECRET = "slack-secret";
    mocks.consumedState = {
      userId: "owner-1",
      provider: "slack",
      redirectUri: "https://void.example/api/connectors/slack/callback",
      verifier: "s".repeat(43),
    };
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: false, error: "invalid_code" }),
    );
    const result = await finishConnectorOAuth(
      "slack",
      "authorization-code",
      "state",
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: false,
      error: "Provider did not return a valid token",
    });
    expect(JSON.stringify(result)).not.toContain("invalid_code");
    expect(mocks.values).toBeUndefined();
  });

  it("uses Slack's documented PKCE exchange and stores the user token, not the bot token", async () => {
    process.env.SLACK_CLIENT_ID = "slack-client";
    process.env.SLACK_CLIENT_SECRET = "must-not-be-sent";
    mocks.consumedState = {
      userId: "owner-1",
      provider: "slack",
      redirectUri: "https://void.example/api/connectors/slack/callback",
      verifier: "s".repeat(43),
    };
    const requests: Request[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (requests.length === 1) {
          return Response.json({
            ok: true,
            access_token: "bot-token",
            authed_user: { access_token: "user-token" },
            scope: "users:read",
          });
        }
        return Response.json({
          ok: true,
          user: "slack-user",
          team: "team-name",
        });
      },
    );

    const result = await finishConnectorOAuth(
      "slack",
      "oauth-code",
      "signed-state",
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({ ok: true, name: "slack-user" });
    const tokenRequest = await requests[0].text();
    expect(tokenRequest).toContain("code_verifier=");
    expect(tokenRequest).toContain("client_id=slack-client");
    expect(tokenRequest).not.toContain("must-not-be-sent");
    expect(
      decryptConnectorToken(
        "owner-1",
        "slack",
        "access",
        mocks.values?.accessToken as string,
      ),
    ).toBe("user-token");
  });
});
