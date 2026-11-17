import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getPreferences } = vi.hoisted(() => ({ getPreferences: vi.fn() }));
vi.mock("@/lib/db/repository", () => ({
  userRepository: { getPreferences },
}));

import {
  loadUserProviderCredentials,
  resolveByokProvider,
  resolveUserProviderCredential,
} from "./user-provider-byok";

describe("user hosted provider credentials", () => {
  it("only resolves supported gateway provider ids", () => {
    expect(resolveByokProvider("anthropic/claude-sonnet-5")).toBe("anthropic");
    expect(resolveByokProvider("alibaba/qwen3.6-plus")).toBe("alibaba");
    expect(resolveByokProvider("TensorX/moonshotai/kimi-k3")).toBeNull();
    expect(resolveByokProvider("Local Models/llama3")).toBeNull();
  });

  it("decrypts only the selected model provider key", () => {
    const decrypt = vi.fn((ciphertext: string) => `plain:${ciphertext}`);
    expect(
      resolveUserProviderCredential(
        "anthropic/claude-sonnet-5",
        { anthropic: "encrypted-anthropic", openai: "encrypted-openai" },
        decrypt,
      ),
    ).toEqual({ provider: "anthropic", apiKey: "plain:encrypted-anthropic" });
    expect(decrypt).toHaveBeenCalledExactlyOnceWith("encrypted-anthropic");
  });

  it("does not create BYOK options without a saved credential", () => {
    expect(resolveUserProviderCredential("openai/gpt-5", {})).toBeNull();
  });

  it("fails closed when a stored credential cannot be decrypted", () => {
    expect(() =>
      resolveUserProviderCredential(
        "google/gemini-3.1-pro-preview",
        { google: "broken-ciphertext" },
        () => {
          throw new Error("authentication tag mismatch");
        },
      ),
    ).toThrow("authentication tag mismatch");
  });

  it("loads credentials once for the providers in a bounded fallback chain", async () => {
    getPreferences.mockResolvedValue({
      aiProviderKeys: {
        anthropic: "encrypted-ant",
        google: "encrypted-google",
        openai: "unused-key",
      },
    });

    await expect(
      loadUserProviderCredentials(
        [
          "anthropic/claude-sonnet-5",
          "google/gemini-3.1-pro-preview",
          "TensorX/moonshotai/kimi-k3",
        ],
        "user-1",
        (ciphertext) => `plain:${ciphertext}`,
      ),
    ).resolves.toEqual({
      anthropic: [{ apiKey: "plain:encrypted-ant" }],
      google: [{ apiKey: "plain:encrypted-google" }],
    });
    expect(getPreferences).toHaveBeenCalledExactlyOnceWith("user-1");
  });
});
