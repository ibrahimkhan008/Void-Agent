import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
  encryptionAvailable: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (request: Request, session: unknown) => unknown) =>
    (request: Request) =>
      handler(request, { user: { id: "user-1" } }),
}));
vi.mock("@/lib/db/repository", () => ({
  userRepository: {
    getPreferences: vi.fn(async () => state.preferences),
    updatePreferences: vi.fn(
      async (_userId: string, preferences: Record<string, unknown>) => {
        state.preferences = preferences;
        return { preferences };
      },
    ),
  },
}));
vi.mock("@/lib/security/encryption", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  isEncryptionAvailable: () => state.encryptionAvailable,
}));

import { GET, PUT } from "./route";

const put = (body: unknown) =>
  PUT(
    new NextRequest("http://localhost/api/user/provider-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("/api/user/provider-keys", () => {
  beforeEach(() => {
    state.preferences = { profession: "Engineer" };
    state.encryptionAvailable = true;
  });

  it("encrypts keys and exposes only configured status", async () => {
    const response = await put({
      provider: "anthropic",
      apiKey: "sk-ant-secret",
    });
    expect(response.status).toBe(200);
    expect(state.preferences).toMatchObject({
      profession: "Engineer",
      aiProviderKeys: { anthropic: "encrypted:sk-ant-secret" },
    });
    expect(JSON.stringify(await response.json())).not.toContain(
      "sk-ant-secret",
    );
    const status = await GET(
      new Request("http://localhost/api/user/provider-keys"),
    );
    expect(JSON.stringify(await status.json())).not.toContain("encrypted:");
  });

  it("rejects unsupported providers and invalid keys", async () => {
    expect((await put({ provider: "local", apiKey: "abc" })).status).toBe(400);
    expect((await put({ provider: "openai", apiKey: " " })).status).toBe(400);
  });

  it("requires encryption before accepting a credential", async () => {
    state.encryptionAvailable = false;
    expect(
      (await put({ provider: "openai", apiKey: "sk-secret" })).status,
    ).toBe(503);
  });

  it("removes the selected key without disturbing other settings", async () => {
    state.preferences = {
      profession: "Engineer",
      aiProviderKeys: { openai: "encrypted:one", google: "encrypted:two" },
    };
    expect((await put({ provider: "openai", apiKey: null })).status).toBe(200);
    expect(state.preferences).toEqual({
      profession: "Engineer",
      aiProviderKeys: { google: "encrypted:two" },
    });
  });
});
