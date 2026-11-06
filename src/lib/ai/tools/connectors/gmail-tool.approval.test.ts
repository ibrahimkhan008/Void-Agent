import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  refreshConnectorToken: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/email-approval-repository.pg", () => ({
  emailApprovalRepository: { consume: mocks.consume },
}));

import { createGmailToolForUser } from "./gmail-tool";

async function execute(input: Record<string, unknown>) {
  const tool = createGmailToolForUser("owner-1");
  return (tool.execute as (value: unknown, options: unknown) => Promise<unknown>)(input, {});
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [{ isConnected: true, email: "owner@example.com" }] }) }),
  });
  mocks.refreshConnectorToken.mockResolvedValue("provider-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sent-1" }), { status: 200 })));
});

describe("Gmail send approval enforcement", () => {
  it("refuses a direct send without a single-use approval", async () => {
    const result = await execute({ action: "send", to: "person@example.com", subject: "Hi", message: "Hello" }) as { error?: string };
    expect(result.error).toContain("not approved");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an approval if the model changes an approved field", async () => {
    mocks.consume.mockResolvedValueOnce(false);
    const result = await execute({ action: "send", to: "person@example.com", subject: "Changed", message: "Hello", approvalToken: "x".repeat(40) }) as { error?: string };
    expect(result.error).toContain("reviewed fields changed");
    expect(mocks.consume).toHaveBeenCalledWith("owner-1", "x".repeat(40), {
      action: "send", to: "person@example.com", subject: "Changed", body: "Hello",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes authorization bound to the exact values before sending", async () => {
    const result = await execute({ action: "send", to: "person@example.com", subject: "Hi", message: "Hello", approvalToken: "x".repeat(40) }) as { success?: boolean };
    expect(result.success).toBe(true);
    expect(mocks.consume).toHaveBeenCalledWith("owner-1", "x".repeat(40), {
      action: "send", to: "person@example.com", subject: "Hi", body: "Hello",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
