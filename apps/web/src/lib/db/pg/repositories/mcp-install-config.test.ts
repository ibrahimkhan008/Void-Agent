import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertMcpInstallConfigSupported } from "./mcp-install-config";

describe("MCP marketplace install config", () => {
  it("accepts no config or an empty config", () => {
    expect(() => assertMcpInstallConfigSupported(undefined)).not.toThrow();
    expect(() => assertMcpInstallConfigSupported({})).not.toThrow();
  });

  it("rejects arbitrary fields rather than persisting possible secrets in plaintext", () => {
    expect(() =>
      assertMcpInstallConfigSupported({ apiKey: "secret-value" }),
    ).toThrow("MCP marketplace install configuration is not supported");
    expect(() =>
      assertMcpInstallConfigSupported({ accessToken: "secret-value" }),
    ).toThrow("MCP marketplace install configuration is not supported");
  });
});
