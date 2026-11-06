import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/jira-approval-repository.pg", () => ({ jiraApprovalRepository: { consume: mocks.consume } }));

import { createJiraToolForUser } from "./jira-tool";

async function execute(input: unknown) {
  const created = createJiraToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true, metadata: { jiraCloudId: "cloud-1" } }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("jira-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "comment-1" }), { status: 201 })));
});

describe("Jira comment approvals", () => {
  it("refuses to write without a review token", async () => {
    const result = await execute({ action: "add_comment", issueKey: "PROJ-123", comment: "Hello" }) as { error?: string };
    expect(result.error).toContain("approval token");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes a current-user exact-payload token before the Jira write", async () => {
    const token = "j".repeat(48);
    const result = await execute({ action: "add_comment", issueKey: "PROJ-123", comment: "Approved comment", approvalToken: token });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", token, { issueKey: "PROJ-123", comment: "Approved comment" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/issue/PROJ-123/comment",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("Approved comment") }),
    );
    expect(result).toMatchObject({ success: true });
  });

  it("does not write with expired, changed, or replayed approval", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({ action: "add_comment", issueKey: "PROJ-123", comment: "Changed", approvalToken: "r".repeat(48) }) as { error?: string };
    expect(result.error).toContain("not approved");
    expect(fetch).not.toHaveBeenCalled();
  });
});
