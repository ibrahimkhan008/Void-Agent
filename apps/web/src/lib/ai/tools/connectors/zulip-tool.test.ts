import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ zulip: vi.fn(), consume: vi.fn() }));
vi.mock("lib/connectors/zulip", () => ({ callZulipApi: mocks.zulip }));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({ connectorActionApprovalRepository: { consume: mocks.consume } }),
);
vi.mock("lib/connectors/provider-api", () => ({
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
import { createZulipToolForUser } from "./zulip-tool";

const execute = (input: Record<string, unknown>) =>
  (createZulipToolForUser("zulip-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.zulip.mockResolvedValue({
    result: "success",
    streams: [{ name: "general" }],
    messages: [{ id: 1 }],
    id: 42,
  });
});

describe("Zulip connector", () => {
  it("bounds read inputs and dispatches reads through the pinned realm helper", async () => {
    const schema = (createZulipToolForUser("zulip-owner") as any).inputSchema;
    expect(
      schema.safeParse({ action: "list_streams", limit: 101 }).success,
    ).toBe(false);
    await execute({ action: "list_streams", limit: 10 });
    expect(mocks.zulip).toHaveBeenCalledWith("zulip-owner", "/api/v1/streams");
    await execute({
      action: "list_messages",
      stream: "general",
      topic: "news",
      numBefore: 5,
      numAfter: 2,
      anchor: "newest",
    });
    expect(mocks.zulip).toHaveBeenCalledWith(
      "zulip-owner",
      "/api/v1/messages",
      expect.objectContaining({
        query: {
          num_before: 5,
          num_after: 2,
          anchor: "newest",
          narrow: JSON.stringify([
            { operator: "stream", operand: "general" },
            { operator: "topic", operand: "news" },
          ]),
        },
      }),
    );
  });

  it("rejects sends without a matching approval and never contacts the realm", async () => {
    const result = await execute({
      action: "send_message",
      stream: "general",
      topic: "news",
      content: "Exact approved text",
      approvalToken: "h".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("zulip-owner", "h".repeat(43), {
      provider: "zulip",
      action: "send_message",
      payload: {
        stream: "general",
        topic: "news",
        content: "Exact approved text",
      },
    });
    expect(mocks.zulip).not.toHaveBeenCalled();
  });

  it("sends only the exact approved message to the pinned realm endpoint", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "send_message",
      stream: "general",
      topic: "news",
      content: "Exact approved text",
      approvalToken: "i".repeat(43),
    });
    expect(result).toMatchObject({ success: true, messageId: 42 });
    expect(mocks.zulip).toHaveBeenCalledWith(
      "zulip-owner",
      "/api/v1/messages",
      expect.objectContaining({
        method: "POST",
        body: {
          type: "stream",
          to: "general",
          topic: "news",
          content: "Exact approved text",
        },
      }),
    );
  });

  it("redacts provider failures and rejects a changed payload after approval", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.zulip.mockRejectedValueOnce(new Error("private realm detail"));
    expect(await execute({ action: "list_streams" })).toEqual({
      error: "Zulip action failed",
    });
    // Approval is bound to one exact payload: different content must consume a different digest.
    await execute({
      action: "send_message",
      stream: "general",
      topic: "news",
      content: "Tampered text",
      approvalToken: "j".repeat(43),
    });
    expect(mocks.consume).toHaveBeenCalledWith("zulip-owner", "j".repeat(43), {
      provider: "zulip",
      action: "send_message",
      payload: { stream: "general", topic: "news", content: "Tampered text" },
    });
  });
});
