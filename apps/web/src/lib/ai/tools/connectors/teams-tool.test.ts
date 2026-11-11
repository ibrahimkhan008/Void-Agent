import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), consume: vi.fn() }));

vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { consume: mocks.consume },
  }),
);

import { createTeamsToolForUser } from "./teams-tool";

const execute = (input: Record<string, unknown>) =>
  (createTeamsToolForUser("teams-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ value: [{ id: "chat-1" }], id: "message-1" });
});

describe("Microsoft Teams connector tool", () => {
  it("reads chats with a bounded page size and owner-scoped credentials", async () => {
    const result = await execute({ action: "list_chats", maxResults: 5 });
    expect(result.chats).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "teams-owner",
      "teams",
      "/v1.0/me/chats",
      expect.objectContaining({
        query: { $top: 5, $orderby: "lastUpdatedDateTime desc" },
      }),
    );
  });

  it("never sends a message without exact owner-bound approval", async () => {
    const result = await execute({
      action: "send_chat_message",
      chatId: "chat-1",
      message: "hello",
      approvalToken: "f".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("teams-owner", "f".repeat(43), {
      provider: "teams",
      action: "send_chat_message",
      payload: { chatId: "chat-1", message: "hello" },
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("sends only the exact approved message payload", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "send_chat_message",
      chatId: "chat-1",
      message: "approved text",
      approvalToken: "g".repeat(43),
    });
    expect(result).toEqual({ success: true, messageId: "message-1" });
    expect(mocks.api).toHaveBeenCalledWith(
      "teams-owner",
      "teams",
      "/v1.0/me/chats/chat-1/messages",
      {
        method: "POST",
        body: { body: { contentType: "text", content: "approved text" } },
      },
    );
  });
});
