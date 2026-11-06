import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/task-creation-approval-repository.pg", () => ({ taskCreationApprovalRepository: { consume: mocks.consume } }));

import { createAsanaToolForUser } from "./asana-tool";
import { createClickUpToolForUser } from "./clickup-tool";

async function execute(tool: unknown, input: unknown) {
  const created = tool as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { gid: "task-1" } }), { status: 201 })));
});

describe("task creation approvals", () => {
  it("requires exact project/name/notes approval before Asana creation", async () => {
    const tool = createAsanaToolForUser("user-1");
    const blocked = await execute(tool, { action: "create_task", projectGid: "42", name: "Review" }) as { error?: string };
    expect(blocked.error).toContain("approvalToken");
    expect(fetch).not.toHaveBeenCalled();
    await execute(tool, { action: "create_task", projectGid: "42", name: "Review", notes: "Check release", approvalToken: "a".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "a".repeat(48), { provider: "asana", targetId: "42", name: "Review", details: "Check release" });
    expect(fetch).toHaveBeenCalledWith("https://app.asana.com/api/1.0/tasks", expect.objectContaining({ method: "POST", body: expect.stringContaining("Check release") }));
  });

  it("requires exact list/name/description approval before ClickUp creation", async () => {
    const tool = createClickUpToolForUser("user-1");
    await execute(tool, { action: "create_task", listId: "77", name: "Ship", description: "Release", approvalToken: "c".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "c".repeat(48), { provider: "clickup", targetId: "77", name: "Ship", details: "Release" });
    expect(fetch).toHaveBeenCalledWith("https://api.clickup.com/api/v2/list/77/task", expect.objectContaining({ method: "POST", body: expect.stringContaining("Release") }));
    mocks.consume.mockResolvedValue(false);
    vi.mocked(fetch).mockClear();
    const stale = await execute(tool, { action: "create_task", listId: "77", name: "Altered", description: "Release", approvalToken: "c".repeat(48) }) as { error?: string };
    expect(stale.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
