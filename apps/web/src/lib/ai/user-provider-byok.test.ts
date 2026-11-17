import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
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
});
