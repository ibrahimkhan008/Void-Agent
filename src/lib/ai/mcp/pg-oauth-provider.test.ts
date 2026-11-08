import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedSession: vi.fn(),
  getSessionByState: vi.fn(),
  deleteByState: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/repositories/mcp-oauth-repository.pg", () => ({
  pgMcpOAuthRepository: {
    getAuthenticatedSession: mocks.getAuthenticatedSession,
    getSessionByState: mocks.getSessionByState,
    deleteByState: mocks.deleteByState,
  },
}));
vi.mock("lib/logger", () => ({
  default: {
    withDefaults: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));
vi.mock("consola/utils", () => ({
  colorize: (_style: string, text: string) => text,
}));
vi.mock("lib/utils", () => ({ generateUUID: () => "generated-state" }));

import { PgOAuthClientProvider } from "./pg-oauth-provider";

const oauthSession = (redirectUri: string, tokens: unknown = null) => ({
  id: "oauth-1",
  mcpServerId: "server-1",
  serverUrl: "https://mcp.example/mcp",
  state: "state-1",
  tokens,
  clientInfo: {
    client_id: "client-1",
    redirect_uris: [redirectUri],
  },
});

function createProvider() {
  return new PgOAuthClientProvider({
    name: "example",
    mcpServerId: "server-1",
    serverUrl: "https://mcp.example/mcp",
    _clientMetadata: {
      client_name: "Void-Agent",
      redirect_uris: ["https://app.example/api/mcp/oauth/callback"],
    },
    onRedirectToAuthorization: vi.fn(),
  });
}

describe("PgOAuthClientProvider redirect validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([null, { access_token: "access", token_type: "Bearer" }])(
    "discards a session registered to a different callback URI even when tokens are %s",
    async (tokens) => {
      const stored = oauthSession("https://attacker.example/callback", tokens);
      mocks.getAuthenticatedSession.mockResolvedValue(stored);
      mocks.getSessionByState.mockResolvedValue(stored);

      const provider = createProvider();
      expect(await provider.clientInformation()).toBeUndefined();
      expect(mocks.deleteByState).toHaveBeenCalledWith("state-1");
    },
  );

  it("retains client registration when the callback URI matches exactly", async () => {
    const stored = oauthSession("https://app.example/api/mcp/oauth/callback");
    mocks.getAuthenticatedSession.mockResolvedValue(stored);
    mocks.getSessionByState.mockResolvedValue(stored);

    const provider = createProvider();
    expect(await provider.clientInformation()).toEqual(stored.clientInfo);
    expect(mocks.deleteByState).not.toHaveBeenCalled();
  });
});
