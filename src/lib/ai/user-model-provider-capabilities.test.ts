import { describe, expect, it } from "vitest";
import {
  parseUserProviderModelCatalog,
  serializeUserProviderModelCatalog,
  validateUserProviderCapabilities,
} from "./user-model-provider-capabilities";

describe("user model provider capabilities", () => {
  it("defaults legacy string rows to no tool calling", () => {
    expect(parseUserProviderModelCatalog([" model-a ", "model-b"])).toEqual({
      modelIds: ["model-a", "model-b"],
      capabilities: {
        "model-a": { supportsToolCalling: false },
        "model-b": { supportsToolCalling: false },
      },
    });
  });

  it("keeps only validated per-model capability values", () => {
    expect(
      parseUserProviderModelCatalog([
        { id: "model-a", supportsToolCalling: true },
        { id: "model-b", supportsToolCalling: false },
      ]).capabilities,
    ).toEqual({
      "model-a": { supportsToolCalling: true },
      "model-b": { supportsToolCalling: false },
    });
  });

  it("rejects capabilities for models not returned by discovery", () => {
    expect(
      validateUserProviderCapabilities(
        {
          "model-a": { supportsToolCalling: true },
          unknown: { supportsToolCalling: true },
        },
        ["model-a"],
      ),
    ).toBeNull();
  });

  it("rejects unknown capability fields and nonboolean values", () => {
    expect(
      validateUserProviderCapabilities(
        { "model-a": { supportsToolCalling: true, supportsVision: true } },
        ["model-a"],
      ),
    ).toBeNull();
    expect(
      validateUserProviderCapabilities(
        { "model-a": { supportsToolCalling: "yes" } },
        ["model-a"],
      ),
    ).toBeNull();
  });

  it("serializes one explicit capability record per discovered model", () => {
    const capabilities = validateUserProviderCapabilities(
      { "model-a": { supportsToolCalling: true } },
      ["model-a", "model-b"],
    );
    expect(capabilities).not.toBeNull();
    expect(
      serializeUserProviderModelCatalog(["model-a", "model-b"], capabilities!),
    ).toEqual([
      { id: "model-a", supportsToolCalling: true },
      { id: "model-b", supportsToolCalling: false },
    ]);
  });
});
