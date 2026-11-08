import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMcpServerConfigFingerprint,
  getMcpApprovalTokenKey,
  hashMcpToolApproval,
  mcpToolApprovalProposalSchema,
  mcpToolApprovalSchema,
} from "./mcp-tool-approval";

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-mcp-fingerprint-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MCP tool approval payload", () => {
  it("binds server identity, tool and canonical JSON arguments", () => {
    const first = mcpToolApprovalSchema.parse({
      serverId: "00000000-0000-4000-8000-000000000001",
      serverName: "Local CRM",
      toolName: "update_record",
      payload: { id: "42", fields: { status: "active", region: "west" } },
    });
    const second = mcpToolApprovalSchema.parse({
      serverId: "00000000-0000-4000-8000-000000000001",
      serverName: "Local CRM",
      toolName: "update_record",
      payload: { fields: { region: "west", status: "active" }, id: "42" },
    });
    expect(hashMcpToolApproval(first)).toBe(hashMcpToolApproval(second));
    expect(hashMcpToolApproval(first)).not.toBe(
      hashMcpToolApproval({ ...first, toolName: "delete_record" }),
    );
  });

  it("bounds the server, tool and JSON payload", () => {
    expect(
      mcpToolApprovalSchema.safeParse({
        serverId: "bad",
        serverName: "Local",
        toolName: "delete",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      mcpToolApprovalSchema.safeParse({
        serverId: "00000000-0000-4000-8000-000000000001",
        serverName: "Local",
        toolName: "bad tool",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      mcpToolApprovalSchema.safeParse({
        serverId: "00000000-0000-4000-8000-000000000001",
        serverName: "Local",
        toolName: "update",
        payload: { data: "x".repeat(16_001) },
      }).success,
    ).toBe(false);
  });

  it("chooses a token field that cannot shadow an MCP argument", () => {
    expect(
      getMcpApprovalTokenKey({
        voidAgentApprovalToken: { type: "string" },
        voidAgentApprovalToken_: { type: "number" },
      }),
    ).toBe("voidAgentApprovalToken__");
  });

  it("HMACs canonical MCP config without exposing endpoint credentials", () => {
    const first = createMcpServerConfigFingerprint({
      url: "https://example.test/mcp",
      headers: { authorization: "very-secret", z: "1" },
    });
    const reordered = createMcpServerConfigFingerprint({
      headers: { z: "1", authorization: "very-secret" },
      url: "https://example.test/mcp",
    });
    expect(first).toBe(reordered);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("very-secret");
    expect(first).not.toBe(
      createMcpServerConfigFingerprint({
        url: "https://other.test/mcp",
        headers: { authorization: "very-secret", z: "1" },
      }),
    );
  });

  it("changes the fingerprint when the HMAC key changes and fails closed without it", () => {
    const config = { url: "https://example.test/mcp" };
    vi.stubEnv("BETTER_AUTH_SECRET", "first-secret");
    const first = createMcpServerConfigFingerprint(config);
    vi.stubEnv("BETTER_AUTH_SECRET", "second-secret");
    expect(createMcpServerConfigFingerprint(config)).not.toBe(first);

    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(() => createMcpServerConfigFingerprint(config)).toThrow(
      /BETTER_AUTH_SECRET is required/i,
    );
  });

  it("requires the config snapshot captured with the proposed MCP tool", () => {
    const proposal = {
      serverId: "00000000-0000-4000-8000-000000000001",
      serverName: "CRM",
      toolName: "update_record",
      payload: { id: "42" },
    };
    expect(
      mcpToolApprovalProposalSchema.safeParse({
        ...proposal,
        serverConfigFingerprint: "a".repeat(64),
      }).success,
    ).toBe(true);
    expect(mcpToolApprovalProposalSchema.safeParse(proposal).success).toBe(
      false,
    );
    expect(
      mcpToolApprovalProposalSchema.safeParse({
        ...proposal,
        serverConfigFingerprint: "not-a-fingerprint",
      }).success,
    ).toBe(false);
  });
});
