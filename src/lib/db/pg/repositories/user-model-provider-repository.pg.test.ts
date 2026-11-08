import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  returned: vi.fn(),
}));
vi.mock("../db.pg", () => ({
  pgDb: {
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values);
        return { returning: mocks.returned };
      },
    }),
  },
}));
vi.mock("lib/security/encryption", () => ({
  encrypt: (value: string) => `cipher:${value}`,
  decrypt: (value: string) => value.replace(/^cipher:/u, ""),
}));

import { userModelProviderRepository } from "./user-model-provider-repository.pg";

describe("user model provider credential persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returned.mockImplementation(async () => [
      {
        id: "provider-id",
        userId: "owner-a",
        name: "Gateway",
        baseUrl: "https://provider.example/v1",
        encryptedApiKey: "cipher:secret-value",
        modelIds: [{ id: "model-a", supportsToolCalling: true }],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ]);
  });

  it("encrypts keys before database persistence and returns only a summary", async () => {
    const result = await userModelProviderRepository.saveForUser({
      userId: "owner-a",
      name: "Gateway",
      baseUrl: "https://provider.example/v1",
      apiKey: " secret-value ",
      modelIds: ["model-a"],
      capabilities: { "model-a": { supportsToolCalling: true } },
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-a",
        encryptedApiKey: "cipher:secret-value",
        modelIds: [{ id: "model-a", supportsToolCalling: true }],
      }),
    );
    expect(mocks.insertValues.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
    expect(result).toMatchObject({
      hasApiKey: true,
      modelIds: ["model-a"],
      capabilities: { "model-a": { supportsToolCalling: true } },
    });
    expect(result).not.toHaveProperty("apiKey");
    expect(result).not.toHaveProperty("encryptedApiKey");
  });
});
