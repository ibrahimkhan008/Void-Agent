import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/zendesk-approval-repository.pg", () => ({ zendeskApprovalRepository: { consume: mocks.consume } }));

import { createZendeskToolForUser } from "./zendesk-tool";

async function execute(input: unknown) {
  const created = createZendeskToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZENDESK_SUBDOMAIN = "example";
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("zendesk-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { id: 123 } }), { status: 200 })));
});

describe("Zendesk comment approvals", () => {
  it("refuses to write without a review token", async () => {
    const result = await execute({ action: "add_comment", ticketId: 123, comment: "Hello" }) as { error?: string };
    expect(result.error).toContain("required");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes exact current-user approval before a ticket update", async () => {
    const token = "z".repeat(48);
    const result = await execute({ action: "add_comment", ticketId: 123, comment: "Approved comment", approvalToken: token });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", token, { ticketId: "123", comment: "Approved comment" });
    expect(fetch).toHaveBeenCalledWith("https://example.zendesk.com/api/v2/tickets/123.json", expect.objectContaining({ method: "PUT" }));
    expect(result).toMatchObject({ ticket: { id: 123 } });
  });

  it("fails closed on invalid and stale/replayed approval", async () => {
    const invalid = await execute({ action: "add_comment", ticketId: "1/..", comment: "x", approvalToken: "x".repeat(40) }) as { error?: string };
    expect(invalid.error).toContain("Invalid");
    mocks.consume.mockResolvedValue(false);
    const changed = await execute({ action: "add_comment", ticketId: 123, comment: "Changed", approvalToken: "x".repeat(40) }) as { error?: string };
    expect(changed.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
