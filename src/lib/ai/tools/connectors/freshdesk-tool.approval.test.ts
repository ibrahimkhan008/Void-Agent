import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/freshdesk-approval-repository.pg", () => ({ freshdeskApprovalRepository: { consume: mocks.consume } }));

import { createFreshdeskToolForUser } from "./freshdesk-tool";

async function execute(input: unknown) {
  const created = createFreshdeskToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FRESHDESK_SUBDOMAIN = "example";
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("freshdesk-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 42 }), { status: 201 })));
});

describe("Freshdesk write approvals", () => {
  it("requires approval and reviewed requester identity to create a ticket", async () => {
    const blocked = await execute({ action: "create_ticket", subject: "Help", description: "Please help" }) as { error?: string };
    expect(blocked.error).toContain("requesterEmail");
    expect(fetch).not.toHaveBeenCalled();
    const payload = { action: "create_ticket", subject: "Help", description: "Please help", requesterName: "Sam Example", requesterEmail: "sam@example.com", status: 2, priority: 1 } as const;
    await execute({ ...payload, approvalToken: "f".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "f".repeat(48), payload);
    expect(fetch).toHaveBeenCalledWith("https://example.freshdesk.com/api/v2/tickets", expect.objectContaining({ method: "POST", body: expect.stringContaining("sam@example.com") }));
  });

  it("requires exact approval before ticket replies and fails closed on replay", async () => {
    const payload = { action: "add_reply", ticketId: "123", body: "Reviewed reply" } as const;
    await execute({ ...payload, approvalToken: "r".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "r".repeat(48), payload);
    expect(fetch).toHaveBeenCalledWith("https://example.freshdesk.com/api/v2/tickets/123/reply", expect.objectContaining({ method: "POST" }));
    mocks.consume.mockResolvedValue(false);
    vi.mocked(fetch).mockClear();
    const result = await execute({ ...payload, body: "Changed", approvalToken: "r".repeat(48) }) as { error?: string };
    expect(result.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
