import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's unmocked provider-api import (getFreshdeskOrigin) carries
// `server-only`; neutralize it for the vitest node environment.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  selected: vi.fn(),
  disconnected: vi.fn(),
  encryption: true,
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: any) => (request: any) =>
    handler(request, { user: { id: "user-1" } }),
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: async (condition: unknown) => {
          mocks.selected(condition);
          return mocks.rows;
        },
      }),
    }),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: {
    provider: "provider",
    email: "email",
    isConnected: "isConnected",
    isPaused: "isPaused",
    metadata: "metadata",
    userId: "userId",
  },
}));
vi.mock("lib/connectors/oauth-flow", () => ({
  disconnectConnector: mocks.disconnected,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: () => mocks.encryption,
}));
vi.mock("lib/connectors/oauth-providers", () => ({
  OAUTH_PROVIDER_CONFIG: { gmail: {} },
  getOAuthClientCredentials: () => ({
    clientId: "configured",
    clientSecret: "secret",
  }),
}));

import { DELETE, GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [
    {
      provider: "gmail",
      email: "owner@example.test",
      isConnected: true,
      isPaused: false,
      metadata: { name: "Owner" },
      accessToken: "must-not-leak",
      refreshToken: "must-not-leak",
    },
  ];
  mocks.encryption = true;
});

describe("/api/connectors", () => {
  it("returns the current user's safe connector catalog without token fields", async () => {
    const response = await GET(
      new Request("https://void.example/api/connectors") as any,
    );
    const body = await response.json();
    expect(mocks.selected).toHaveBeenCalledWith({
      column: "userId",
      value: "user-1",
    });
    const gmail = body.connectors.find(
      (connector: any) => connector.provider === "gmail",
    );
    expect(gmail).toMatchObject({
      connectionFlow: "direct-oauth",
      isConnected: true,
      account: "owner@example.test",
      accountName: "Owner",
    });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("disconnects only the authenticated owner's selected provider", async () => {
    const response = await DELETE(
      new Request("https://void.example/api/connectors?provider=gmail") as any,
    );
    expect(response.status).toBe(200);
    expect(mocks.disconnected).toHaveBeenCalledWith("user-1", "gmail");
  });

  it("rejects provider values outside the fixed connector allowlist", async () => {
    const response = await DELETE(
      new Request(
        "https://void.example/api/connectors?provider=https://attacker.test",
      ) as any,
    );
    expect(response.status).toBe(400);
    expect(mocks.disconnected).not.toHaveBeenCalled();
  });
});
