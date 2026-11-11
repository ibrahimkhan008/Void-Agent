import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), consume: vi.fn() }));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({ connectorActionApprovalRepository: { consume: mocks.consume } }),
);
import { createZendeskToolForUser } from "./zendesk-tool";

const execute = (input: Record<string, unknown>) =>
  (createZendeskToolForUser("zendesk-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ ticket: { id: "123" } });
});

describe("Zendesk connector", () => {
  it("bounds ticket identifiers and read limits", async () => {
    const schema = (createZendeskToolForUser("zendesk-owner") as any)
      .inputSchema;
    expect(
      schema.safeParse({
        action: "get_ticket",
        ticketId: "https://attacker.invalid",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ action: "list_tickets", limit: 101 }).success,
    ).toBe(false);
    expect(await execute({ action: "get_ticket", ticketId: "123" })).toEqual({
      ticket: { id: "123" },
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "zendesk-owner",
      "zendesk",
      "/api/v2/tickets/123.json",
    );
  });
  it("does not write without an owner-bound exact approval and writes only approved private comment", async () => {
    const payload = { ticketId: "123", comment: "Internal reviewed comment" };
    expect(
      await execute({
        action: "add_comment",
        ...payload,
        approvalToken: "j".repeat(43),
      }),
    ).toMatchObject({ error: expect.stringContaining("not been approved") });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith(
      "zendesk-owner",
      "j".repeat(43),
      { provider: "zendesk", action: "add_comment", payload },
    );
    mocks.consume.mockResolvedValue(true);
    expect(
      await execute({
        action: "add_comment",
        ...payload,
        approvalToken: "k".repeat(43),
      }),
    ).toEqual({ success: true, ticket: { id: "123" } });
    expect(mocks.api).toHaveBeenCalledWith(
      "zendesk-owner",
      "zendesk",
      "/api/v2/tickets/123.json",
      {
        method: "PUT",
        body: { ticket: { comment: { body: payload.comment, public: false } } },
      },
    );
  });
  it("returns a redacted failure when Zendesk rejects the operation", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockRejectedValue(new Error("sensitive Zendesk body"));
    expect(
      await execute({
        action: "add_comment",
        ticketId: "123",
        comment: "text",
        approvalToken: "m".repeat(43),
      }),
    ).toEqual({ error: "Zendesk action failed" });
  });
});
