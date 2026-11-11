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
import { createFreshdeskToolForUser } from "./freshdesk-tool";

const execute = (input: Record<string, unknown>) =>
  (createFreshdeskToolForUser("freshdesk-owner") as any).execute(input, {});
const newTicket = {
  name: "Ada User",
  email: "ada@example.test",
  subject: "Help",
  description: "Please help",
  status: 2,
  priority: 1,
  source: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ id: 12, status: 2 });
});

describe("Freshdesk connector", () => {
  it("rejects invalid identifiers and bounds ticket listing", async () => {
    const schema = (createFreshdeskToolForUser("freshdesk-owner") as any)
      .inputSchema;
    expect(
      schema.safeParse({ action: "get_ticket", ticketId: "https://evil.test" })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ action: "list_tickets", limit: 101 }).success,
    ).toBe(false);
    expect(await execute({ action: "list_tickets", limit: 5 })).toEqual({
      tickets: [],
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "freshdesk-owner",
      "freshdesk",
      "/api/v2/tickets",
      { query: { per_page: 5 } },
    );
  });
  it("requires approval and creates only the exact reviewed ticket", async () => {
    expect(
      await execute({
        action: "create_ticket",
        ...newTicket,
        approvalToken: "j".repeat(43),
      }),
    ).toMatchObject({ error: expect.stringContaining("not been approved") });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith(
      "freshdesk-owner",
      "j".repeat(43),
      { provider: "freshdesk", action: "create_ticket", payload: newTicket },
    );
    mocks.consume.mockResolvedValue(true);
    expect(
      await execute({
        action: "create_ticket",
        ...newTicket,
        approvalToken: "k".repeat(43),
      }),
    ).toEqual({ success: true, ticket: { id: 12, status: 2 } });
    expect(mocks.api).toHaveBeenCalledWith(
      "freshdesk-owner",
      "freshdesk",
      "/api/v2/tickets",
      { method: "POST", body: newTicket },
    );
  });
  it("requires approval before sending an exact reply and redacts provider errors", async () => {
    const payload = { ticketId: "12", body: "Reviewed reply" };
    expect(
      await execute({
        action: "add_reply",
        ...payload,
        approvalToken: "m".repeat(43),
      }),
    ).toMatchObject({ error: expect.stringContaining("not been approved") });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith(
      "freshdesk-owner",
      "m".repeat(43),
      { provider: "freshdesk", action: "add_reply", payload },
    );
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockRejectedValueOnce(new Error("secret Freshdesk response"));
    expect(
      await execute({
        action: "add_reply",
        ...payload,
        approvalToken: "n".repeat(43),
      }),
    ).toEqual({ error: "Freshdesk action failed" });
    expect(mocks.api).toHaveBeenCalledWith(
      "freshdesk-owner",
      "freshdesk",
      "/api/v2/tickets/12/reply",
      { method: "POST", body: { body: "Reviewed reply" } },
    );
  });
});
