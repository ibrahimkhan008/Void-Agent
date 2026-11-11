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
import { createClickUpToolForUser } from "./clickup-tool";

const execute = (input: Record<string, unknown>) =>
  (createClickUpToolForUser("clickup-owner") as any).execute(input, {});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockImplementation(
    async (_user: string, _provider: string, path: string) => {
      if (path === "/api/v2/team") return { teams: [{ id: 12 }] };
      if (path === "/api/v2/team/12/space")
        return { spaces: [{ id: "space-1" }] };
      if (path === "/api/v2/list/7/task") return { id: "task-1", name: "Task" };
      return {};
    },
  );
});

describe("ClickUp connector", () => {
  it("bounds list inputs and scopes workspace reads to the user", async () => {
    const schema = (createClickUpToolForUser("clickup-owner") as any)
      .inputSchema;
    expect(
      schema.safeParse({ action: "list_spaces", limit: 101 }).success,
    ).toBe(false);
    const result = await execute({ action: "list_spaces", limit: 5 });
    expect(result.spaces).toEqual([{ id: "space-1" }]);
    expect(mocks.api).toHaveBeenNthCalledWith(
      1,
      "clickup-owner",
      "clickup",
      "/api/v2/team",
    );
    expect(mocks.api).toHaveBeenNthCalledWith(
      2,
      "clickup-owner",
      "clickup",
      "/api/v2/team/12/space",
      expect.anything(),
    );
  });
  it("rejects creation without exact owner-bound approval", async () => {
    const result = await execute({
      action: "create_task",
      listId: "7",
      name: "Task",
      description: "Details",
      approvalToken: "j".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith(
      "clickup-owner",
      "j".repeat(43),
      {
        provider: "clickup",
        action: "create_task",
        payload: { listId: "7", name: "Task", description: "Details" },
      },
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("creates only the exact approved task and handles provider failures safely", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "create_task",
      listId: "7",
      name: "Task",
      description: "Details",
      approvalToken: "k".repeat(43),
    });
    expect(result).toEqual({
      success: true,
      task: { id: "task-1", name: "Task" },
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "clickup-owner",
      "clickup",
      "/api/v2/list/7/task",
      { method: "POST", body: { name: "Task", description: "Details" } },
    );
    mocks.api.mockRejectedValueOnce(new Error("private response details"));
    expect(await execute({ action: "get_task", taskId: "7" })).toEqual({
      error: "ClickUp action failed",
    });
  });
});
