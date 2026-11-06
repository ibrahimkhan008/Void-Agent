import { describe, expect, it } from "vitest";
import {
  buildMcpConfigFingerprint,
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
  });
});
