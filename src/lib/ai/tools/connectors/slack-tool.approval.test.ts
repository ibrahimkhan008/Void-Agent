import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/slack-approval-repository.pg", () => ({ slackApprovalRepository: { consume: mocks.consume } }));

import { createSlackToolForUser } from "./slack-tool";

async function execute(input: unknown) {
  const created = createSlackToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("slack-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, message: { ts: "1" } }), { status: 200 })));
});

describe("Slack message approvals", () => {
  it("refuses to post without an approval token", async () => {
    const result = await execute({ action: "send_message", channelId: "C123", text: "Hello" }) as { error?: string };
    expect(result.error).toContain("approval token");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes an exact one-time approval before posting", async () => {
    const token = "s".repeat(40);
    const result = await execute({ action: "send_message", channelId: "C123", text: "Hello", approvalToken: token }) as { ok?: boolean };
    expect(mocks.consume).toHaveBeenCalledWith("user-1", token, { channelId: "C123", text: "Hello" });
    expect(fetch).toHaveBeenCalledWith("https://slack.com/api/chat.postMessage", expect.objectContaining({ method: "POST" }));
    expect(result.ok).toBe(true);
  });

  it("does not post when the approval is expired or replayed", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({ action: "send_message", channelId: "C123", text: "Hello", approvalToken: "r".repeat(40) }) as { error?: string };
    expect(result.error).toContain("not approved");
    expect(fetch).not.toHaveBeenCalled();
  });
});
