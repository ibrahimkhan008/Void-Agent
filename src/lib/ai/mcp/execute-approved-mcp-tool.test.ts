import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("lib/db/pg/repositories/mcp-tool-approval-repository.pg", () => ({
  mcpToolApprovalRepository: { consume: mocks.consume },
}));
vi.mock("server-only", () => ({}));

import { executeApprovedMcpTool } from "./execute-approved-mcp-tool";
import { resolveMorphikImageReference } from "./morphik-media-reference";

const approvalPayload = {
  serverId: "00000000-0000-4000-8000-000000000001",
  serverName: "CRM",
  toolName: "update_record",
  payload: { id: "42" },
};
const fingerprint = "a".repeat(64);
const run = (
  input: Omit<
    Parameters<typeof executeApprovedMcpTool>[0],
    "getCurrentConfigFingerprint"
  > & { getCurrentConfigFingerprint?: () => Promise<string | undefined> },
) =>
  executeApprovedMcpTool({
    getCurrentConfigFingerprint: async () => fingerprint,
    ...input,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
});

describe("executeApprovedMcpTool", () => {
  it("fails closed without a token or authenticated user", async () => {
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await run({
      userId: undefined,
      token: undefined,
      approvalPayload,
      execute,
    });
    expect(result).toMatchObject({
      isError: true,
      error: { name: "ApprovalRequired" },
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("never calls the MCP server when approval is stale or mismatched", async () => {
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await run({
      userId: "user-1",
      token: "t".repeat(48),
      approvalPayload,
      execute,
    });
    expect(result).toMatchObject({
      isError: true,
      error: { name: "ApprovalRequired" },
    });
    expect(mocks.consume).toHaveBeenCalledWith(
      "user-1",
      "t".repeat(48),
      approvalPayload,
      fingerprint,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("consumes the exact approval before calling the MCP server", async () => {
    mocks.consume.mockResolvedValue(true);
    const execute = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "done" }] });
    const result = await run({
      userId: "user-1",
      token: "t".repeat(48),
      approvalPayload,
      execute,
    });
    expect(result).toEqual({ content: [{ type: "text", text: "done" }] });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("replaces Morphik signed URLs with user-bound references before returning the MCP result", async () => {
    mocks.consume.mockResolvedValue(true);
    const previousKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = "m".repeat(32);
    const signedUrl =
      "https://s3.amazonaws.com/bucket/image.png?X-Amz-Signature=private";
    try {
      const result = await run({
        userId: "user-1",
        token: "t".repeat(48),
        approvalPayload,
        execute: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: `[IMAGE_URL]${signedUrl}[/IMAGE_URL]`,
            },
          ],
        }),
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("X-Amz-Signature");
      expect(serialized).not.toContain("private");
      const reference = (
        result as { content: Array<{ text: string }> }
      ).content[0]?.text.match(/\[IMAGE_REF\](.*?)\[\/IMAGE_REF\]/)?.[1];
      expect(reference).toBeTruthy();
      expect(resolveMorphikImageReference(reference, "user-1")).toBe(signedUrl);
      expect(resolveMorphikImageReference(reference, "user-2")).toBeNull();
    } finally {
      if (previousKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
      else process.env.ENCRYPTION_MASTER_KEY = previousKey;
    }
  });

  it("does not forward oversized MCP tool results into chat", async () => {
    mocks.consume.mockResolvedValue(true);
    const execute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "x".repeat(1_100_000) }],
    });
    const result = await run({
      userId: "user-1",
      token: "t".repeat(48),
      approvalPayload,
      execute,
    });

    expect(result).toEqual({
      isError: true,
      error: {
        name: "McpResultTooLarge",
        message:
          "MCP server returned a result above the 1 MiB display limit. Request a smaller result from the server.",
      },
      content: [],
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("keeps small MCP results unchanged and rejects non-serializable results", async () => {
    mocks.consume.mockResolvedValue(true);
    const small = { content: [{ type: "text", text: "done" }] };
    await expect(
      run({
        userId: "user-1",
        token: "t".repeat(48),
        approvalPayload,
        execute: vi.fn().mockResolvedValue(small),
      }),
    ).resolves.toBe(small);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await expect(
      run({
        userId: "user-1",
        token: "t".repeat(48),
        approvalPayload,
        execute: vi.fn().mockResolvedValue(cyclic),
      }),
    ).resolves.toMatchObject({
      isError: true,
      error: { name: "McpResultUnavailable" },
      content: [],
    });

    await expect(
      run({
        userId: "user-1",
        token: "t".repeat(48),
        approvalPayload,
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toMatchObject({
      isError: true,
      error: { name: "McpResultUnavailable" },
      content: [],
    });
  });

  it("does not consume or invoke a call after the config has changed since the review", async () => {
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await run({
      userId: "user-1",
      token: "t".repeat(48),
      approvalPayload,
      getCurrentConfigFingerprint: async () => "b".repeat(64),
      execute,
    });
    expect(result).toMatchObject({
      isError: true,
      error: { name: "ApprovalRequired" },
    });
    expect(mocks.consume).toHaveBeenCalledWith(
      "user-1",
      "t".repeat(48),
      approvalPayload,
      "b".repeat(64),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rechecks configuration after token consumption and blocks a config-change race", async () => {
    mocks.consume.mockResolvedValue(true);
    const getCurrentConfigFingerprint = vi
      .fn()
      .mockResolvedValueOnce(fingerprint)
      .mockResolvedValueOnce("b".repeat(64));
    const execute = vi.fn().mockResolvedValue("ran");
    const result = await executeApprovedMcpTool({
      userId: "user-1",
      token: "t".repeat(48),
      approvalPayload,
      getCurrentConfigFingerprint,
      execute,
    });
    expect(result).toMatchObject({
      isError: true,
      error: { name: "ApprovalRequired" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
