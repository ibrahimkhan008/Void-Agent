import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  consume: vi.fn(),
}));

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

import { createGmailToolForUser } from "./gmail-tool";

const execute = (input: Record<string, unknown>) =>
  (createGmailToolForUser("user-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockImplementation(
    async (_user: string, _provider: string, path: string) => {
      if (path.endsWith("/messages")) return { messages: [{ id: "msg-1" }] };
      if (path.endsWith("/messages/send")) return { id: "sent-1" };
      return {
        id: "msg-1",
        threadId: "thread-1",
        snippet: "A short message",
        payload: {
          headers: [
            { name: "From", value: "sender@example.test" },
            { name: "Subject", value: "Hello" },
            { name: "Date", value: "Tue, 10 Nov 2026 10:00:00 GMT" },
            { name: "Message-ID", value: "<message@example.test>" },
          ],
        },
      };
    },
  );
});

describe("Gmail connector tool", () => {
  it("lists a bounded inbox using only the bound owner's token", async () => {
    const result = await execute({ action: "inbox", maxResults: 1 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: "msg-1",
      from: "sender@example.test",
      subject: "Hello",
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "gmail",
      "/gmail/v1/users/me/messages",
      expect.anything(),
    );
  });

  it("never sends a message unless the exact owner-bound approval is consumed", async () => {
    const result = await execute({
      action: "send",
      to: "recipient@example.test",
      subject: "Approved subject",
      message: "Approved body",
      approvalToken: "a".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("user-owner", "a".repeat(43), {
      provider: "gmail",
      action: "send",
      payload: {
        to: "recipient@example.test",
        subject: "Approved subject",
        message: "Approved body",
      },
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("sends only the exact approved message payload", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "send",
      to: "recipient@example.test",
      subject: "Approved subject",
      message: "Approved body",
      approvalToken: "a".repeat(43),
    });
    expect(result).toEqual({ success: true, messageId: "sent-1" });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    const [ownerId, provider, path, options] = mocks.api.mock.calls[0];
    expect([ownerId, provider, path]).toEqual([
      "user-owner",
      "gmail",
      "/gmail/v1/users/me/messages/send",
    ]);
    const raw = Buffer.from(options.body.raw, "base64url").toString("utf8");
    expect(raw).toContain(
      "To: recipient@example.test\r\nSubject: Approved subject",
    );
    expect(raw).toContain("\r\n\r\nApproved body");
  });

  it("requires prior approval for reply and links it to the original thread", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "reply",
      messageId: "msg-1",
      message: "Reply body",
      approvalToken: "b".repeat(43),
    });
    expect(result).toEqual({ success: true, messageId: "sent-1" });
    expect(mocks.consume).toHaveBeenCalledWith("user-owner", "b".repeat(43), {
      provider: "gmail",
      action: "reply",
      payload: { messageId: "msg-1", message: "Reply body" },
    });
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api.mock.calls[1][2]).toBe("/gmail/v1/users/me/messages/send");
    expect(mocks.api.mock.calls[1][3].body.threadId).toBe("thread-1");
  });
});
