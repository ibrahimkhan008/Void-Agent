import { describe, expect, it } from "vitest";
import {
  buildMcpConfigFingerprint,
  desktopMcpConfigSchema,
  desktopRemoteMcpConfigSchema,
  desktopStdioConfigSchema,
  isDesktopMcpToolAllowed,
} from "./mcp-policy.js";

describe("desktop MCP policy", () => {
  it("accepts bounded stdio configurations but rejects unknown and reserved fields", () => {
    expect(
      desktopStdioConfigSchema.safeParse({
        command: "npx",
        args: ["-y", "@example/mcp"],
        env: { API_TOKEN: "secret" },
      }).success,
    ).toBe(true);
    expect(
      desktopStdioConfigSchema.safeParse({ command: "node", cwd: "C:/" })
        .success,
    ).toBe(false);
    expect(
      desktopStdioConfigSchema.safeParse({
        command: "node",
        env: { PATH: "evil" },
      }).success,
    ).toBe(false);
    expect(
      desktopStdioConfigSchema.safeParse({
        command: "node",
        args: Array(33).fill("x"),
      }).success,
    ).toBe(false);
  });

  it("uses default-deny tool names and stable config fingerprints", () => {
    expect(isDesktopMcpToolAllowed("read_file")).toBe(true);
    expect(isDesktopMcpToolAllowed("list_tools")).toBe(true);
    expect(isDesktopMcpToolAllowed("write_file")).toBe(false);
    const first = desktopStdioConfigSchema.parse({
      command: "node",
      env: { ZED: "z", API_KEY: "a" },
    });
    const second = desktopStdioConfigSchema.parse({
      command: "node",
      env: { API_KEY: "a", ZED: "z" },
    });
    expect(buildMcpConfigFingerprint(first)).toBe(
      buildMcpConfigFingerprint(second),
    );
    expect(buildMcpConfigFingerprint(first)).toMatch(/^[a-f0-9]{64}$/u);
    expect(buildMcpConfigFingerprint(first)).not.toContain("API_KEY");
    const secretConfig = desktopStdioConfigSchema.parse({
      command: "node",
      env: { API_SECRET: "super-secret-env-credential" },
    });
    const secretFingerprint = buildMcpConfigFingerprint(secretConfig);
    expect(secretFingerprint).not.toContain("API_SECRET");
    expect(secretFingerprint).not.toContain("super-secret-env-credential");
  });

  it("does not retain remote credentials in config consent fingerprints", () => {
    const remote = desktopRemoteMcpConfigSchema.parse({
      url: "https://mcp.example.test/rpc",
      headers: { Authorization: "Bearer very-secret-value" },
    });
    const fingerprint = buildMcpConfigFingerprint(remote);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(fingerprint).not.toContain("Authorization");
    expect(fingerprint).not.toContain("very-secret-value");
  });

  it("accepts only bounded HTTPS remote configs with safe transport headers", () => {
    expect(
      desktopMcpConfigSchema.safeParse({
        url: "https://mcp.example.test/rpc",
        headers: { Authorization: "Bearer secret" },
      }).success,
    ).toBe(true);
    for (const config of [
      { url: "http://mcp.example.test/rpc" },
      { url: "https://user:pass@mcp.example.test/rpc" },
      { url: "https://mcp.example.test/rpc#fragment" },
      { url: "https://mcp.example.test/rpc", headers: { Host: "evil.test" } },
      { url: "https://mcp.example.test/rpc", extra: "not permitted" },
      { url: `https://mcp.example.test/${"x".repeat(2_100)}` },
    ]) {
      expect(desktopRemoteMcpConfigSchema.safeParse(config).success).toBe(
        false,
      );
    }
  });

  it("rejects invalid stdio configuration and argument shapes before process execution", () => {
    expect(
      desktopMcpConfigSchema.safeParse({ command: "node", env: { PATH: "x" } })
        .success,
    ).toBe(false);
    expect(
      desktopMcpConfigSchema.safeParse({
        command: "node",
        args: ["x".repeat(2_049)],
      }).success,
    ).toBe(false);
  });
});
