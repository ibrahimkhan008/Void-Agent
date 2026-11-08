import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  rateLimit: vi.fn(),
  fetch: vi.fn(),
  encrypted: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  userModelProviderRepository: {
    listForUser: mocks.list,
    getForRuntime: mocks.get,
    saveForUser: mocks.save,
    deleteForUser: mocks.remove,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/encryption", () => ({
  isEncryptionAvailable: mocks.encrypted,
}));
vi.mock("lib/ai/user-model-provider-transport", () => ({
  USER_PROVIDER_DISCOVERY_TIMEOUT_MS: 15_000,
  fetchUserModelProvider: mocks.fetch,
  normalizeUserProviderBaseUrl: (value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
      throw new Error("blocked");
    }
    return url.toString().replace(/\/$/u, "");
  },
  parseOpenAICompatibleModelIds: (value: { data?: Array<{ id?: string }> }) => [
    ...new Set((value.data ?? []).map((item) => item.id).filter(Boolean)),
  ],
}));

import { DELETE, GET, POST } from "./route";

const request = (
  method: string,
  body?: unknown,
  path = "/api/user/providers",
) =>
  new Request(`https://app.example${path}`, {
    method,
    headers: {
      Origin: "https://app.example",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe("user model providers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-a" } });
    mocks.list.mockResolvedValue([]);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.encrypted.mockReturnValue(true);
    mocks.fetch.mockResolvedValue(
      Response.json({ data: [{ id: "model-a" }, { id: "model-b" }] }),
    );
    mocks.save.mockImplementation(async (input) => ({
      id: "provider-id",
      name: input.name,
      baseUrl: input.baseUrl,
      modelIds: input.modelIds,
      capabilities: input.capabilities,
      hasApiKey: true,
    }));
    mocks.remove.mockResolvedValue(true);
  });

  it("returns only the authenticated owner's sanitized provider records", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "owned",
        hasApiKey: true,
        modelIds: ["a"],
        capabilities: { a: { supportsToolCalling: false } },
      },
    ]);
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      providers: [
        {
          id: "owned",
          hasApiKey: true,
          modelIds: ["a"],
          capabilities: { a: { supportsToolCalling: false } },
        },
      ],
    });
    expect(mocks.list).toHaveBeenCalledWith("owner-a");
  });

  it("allows authenticated read-only catalog access when a safe GET omits Origin", async () => {
    const noOrigin = new Request("https://app.example/api/user/providers", {
      method: "GET",
    });
    expect((await GET(noOrigin)).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("owner-a");
  });

  it("discovers models over the secure transport before encrypting and saving credentials", async () => {
    const response = await POST(
      request("POST", {
        name: "Personal gateway",
        baseUrl: "https://provider.example/v1",
        apiKey: "secret-value",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: { id: "provider-id", modelIds: ["model-a", "model-b"] },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://provider.example/v1/models",
      expect.objectContaining({ method: "GET" }),
      64 * 1024,
      15_000,
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-a", apiKey: "secret-value" }),
    );
  });

  it("accepts tool calling only for IDs rediscovered from the saved endpoint", async () => {
    const response = await POST(
      request("POST", {
        name: "Personal gateway",
        baseUrl: "https://provider.example/v1",
        capabilities: { "model-a": { supportsToolCalling: true } },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        modelIds: ["model-a", "model-b"],
        capabilities: {
          "model-a": { supportsToolCalling: true },
          "model-b": { supportsToolCalling: false },
        },
      }),
    );
  });

  it("rejects tool capability claims for stale model IDs", async () => {
    const response = await POST(
      request("POST", {
        name: "Personal gateway",
        baseUrl: "https://provider.example/v1",
        capabilities: { "stale-model": { supportsToolCalling: true } },
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("updates only an owned provider and reuses its key when the form leaves it blank", async () => {
    const id = "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658";
    mocks.get.mockResolvedValueOnce({
      id,
      baseUrl: "https://provider.example/v1",
      apiKey: "previous-secret",
      modelIds: ["old-model"],
    });
    const response = await POST(
      request("POST", {
        id,
        name: "Renamed gateway",
        baseUrl: "https://provider.example/v1/",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://provider.example/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer previous-secret",
          "api-key": "previous-secret",
        },
      }),
      64 * 1024,
      15_000,
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-a", id, apiKey: undefined }),
    );
  });

  it("rejects an endpoint change without sending the saved key", async () => {
    const id = "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658";
    mocks.get.mockResolvedValueOnce({
      id,
      baseUrl: "https://provider.example/v1",
      apiKey: "previous-secret",
      modelIds: ["old-model"],
    });

    const response = await POST(
      request("POST", {
        id,
        name: "Renamed gateway",
        baseUrl: "https://other-provider.example/v1",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "Enter an API key before changing the provider endpoint",
    });
    expect(JSON.stringify(body)).not.toContain("previous-secret");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("clears tool declarations when the endpoint changes, even if model IDs match", async () => {
    const id = "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658";
    mocks.get.mockResolvedValueOnce({
      id,
      baseUrl: "https://old-provider.example/v1",
      apiKey: "previous-secret",
      modelIds: ["model-a", "model-b"],
    });

    const response = await POST(
      request("POST", {
        id,
        name: "Replacement gateway",
        baseUrl: "https://new-provider.example/v1",
        apiKey: "new-secret",
        capabilities: { "model-a": { supportsToolCalling: true } },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ capabilitiesReset: true });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        capabilities: {
          "model-a": { supportsToolCalling: false },
          "model-b": { supportsToolCalling: false },
        },
      }),
    );
  });

  it("uses only a replacement key when the endpoint changes", async () => {
    const id = "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658";
    mocks.get.mockResolvedValueOnce({
      id,
      baseUrl: "https://provider.example/v1",
      apiKey: "previous-secret",
      modelIds: ["old-model"],
    });

    const response = await POST(
      request("POST", {
        id,
        name: "Updated gateway",
        baseUrl: "https://other-provider.example/v1",
        apiKey: "replacement-secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://other-provider.example/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer replacement-secret",
          "api-key": "replacement-secret",
        },
      }),
      64 * 1024,
      15_000,
    );
    expect(mocks.fetch.mock.calls[0]?.[1]).not.toMatchObject({
      headers: expect.objectContaining({
        Authorization: expect.stringContaining("previous-secret"),
      }),
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-a",
        id,
        apiKey: "replacement-secret",
      }),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "replacement-secret",
    );
  });

  it("requires authentication, same origin, encryption, and rate limits", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request("GET"))).status).toBe(401);

    const crossOriginMutation = new Request(
      "https://app.example/api/user/providers?id=9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
      {
        method: "DELETE",
        headers: { Origin: "https://evil.example" },
      },
    );
    expect((await DELETE(crossOriginMutation)).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.encrypted.mockReturnValue(false);
    expect(
      (
        await POST(
          request("POST", {
            name: "Gateway",
            baseUrl: "https://provider.example/v1",
          }),
        )
      ).status,
    ).toBe(503);

    mocks.encrypted.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(request("GET"))).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS endpoints and restricts deletion to the current owner", async () => {
    const blocked = await POST(
      request("POST", {
        name: "Local",
        baseUrl: "http://127.0.0.1:11434/v1",
      }),
    );
    expect(blocked.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();

    mocks.remove.mockResolvedValueOnce(false);
    const missing = await DELETE(
      request(
        "DELETE",
        undefined,
        "/api/user/providers?id=9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
      ),
    );
    expect(missing.status).toBe(404);
    expect(mocks.remove).toHaveBeenCalledWith(
      "owner-a",
      "9a9b17b2-a413-42cc-a50a-a6e9dfd5f658",
    );
  });
});
