import { describe, expect, it } from "vitest";
import {
  fingerprintDesktopMcpConfig,
  formatLocalMcpCommandForReview,
  isTrustedMcpPage,
  parseDesktopMcpConfig,
  parseDesktopToolCall,
  redactDesktopMcpReviewValue,
} from "./mcp-policy.js";

describe("desktop MCP IPC policy", () => {
  it("accepts bounded stdio and credential-free HTTPS remote configs", () => {
    expect(
      parseDesktopMcpConfig({ command: "node", args: ["server.js"] }),
    ).toEqual({
      command: "node",
      args: ["server.js"],
    });
    expect(
      parseDesktopMcpConfig({
        url: "https://mcp.example/rpc",
        headers: { Authorization: "Bearer x" },
      }),
    ).toMatchObject({ url: "https://mcp.example/rpc" });
  });

  it.each([
    { url: "http://127.0.0.1/rpc" },
    { url: "https://user:pass@mcp.example/rpc" },
    { url: "https://mcp.example/rpc#fragment" },
    { url: "https://mcp.example/rpc", extra: true },
    { url: "https://mcp.example/rpc", headers: { Host: "internal" } },
    { command: "node", env: { PATH: "attacker" } },
    { command: "node", args: Array.from({ length: 33 }, () => "x") },
  ])("rejects unsafe or unexpected config %#", (config) => {
    expect(() => parseDesktopMcpConfig(config)).toThrow();
  });

  it("rejects oversized, malformed, and non-read MCP tool calls", () => {
    expect(() => parseDesktopToolCall(null)).toThrow();
    expect(() =>
      parseDesktopToolCall({ toolName: "write_file", params: {} }),
    ).toThrow("not allowed");
    expect(() =>
      parseDesktopToolCall({
        toolName: "read_file",
        params: { data: "x".repeat(33_000) },
      }),
    ).toThrow("size limit");
    expect(
      parseDesktopToolCall({
        toolName: "read_file",
        params: { path: "notes.txt" },
      }),
    ).toEqual({
      toolName: "read_file",
      params: { path: "notes.txt" },
    });
  });

  it("fingerprints credentials without exposing them and sorts config keys", () => {
    const first = fingerprintDesktopMcpConfig({
      url: "https://mcp.example/rpc",
      headers: { Authorization: "secret", "X-Client": "x" },
    });
    const same = fingerprintDesktopMcpConfig({
      url: "https://mcp.example/rpc",
      headers: { "X-Client": "x", Authorization: "secret" },
    });
    const changed = fingerprintDesktopMcpConfig({
      url: "https://mcp.example/rpc",
      headers: { "X-Client": "x", Authorization: "other" },
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("trusts only the top-level MCP test page on the configured app origin", () => {
    const base = {
      hasWindow: true,
      windowDestroyed: false,
      senderMatches: true,
      mainFrameMatches: true,
      frameUrl: "https://app.example/mcp/test/abc",
      appOrigin: "https://app.example",
    };
    expect(isTrustedMcpPage(base)).toBe(true);
    expect(
      isTrustedMcpPage({
        ...base,
        frameUrl: "https://evil.example/mcp/test/abc",
      }),
    ).toBe(false);
    expect(
      isTrustedMcpPage({ ...base, frameUrl: "https://app.example/chat" }),
    ).toBe(false);
    expect(isTrustedMcpPage({ ...base, mainFrameMatches: false })).toBe(false);
  });

  it("redacts credential fields and common CLI secrets in review dialogs", () => {
    expect(
      redactDesktopMcpReviewValue({
        path: "notes.txt",
        apiKey: "secret",
        nested: { password: "p" },
      }),
    ).toEqual({
      path: "notes.txt",
      apiKey: "[redacted]",
      nested: { password: "[redacted]" },
    });
    expect(
      formatLocalMcpCommandForReview({
        command: "node",
        args: ["server.js", "--api-key", "secret"],
      }),
    ).toBe("node server.js --api-key [redacted]");
  });
});
