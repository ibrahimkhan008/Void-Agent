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
import { createAsanaToolForUser } from "./asana-tool";

const execute = (input: Record<string, unknown>) =>
  (createAsanaToolForUser("asana-owner") as any).execute(input, {});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ data: { gid: "task-1", name: "Task" } });
});

describe("Asana connector", () => {
  it("bounds list inputs and scopes reads to the user", async () => {
    const schema = (createAsanaToolForUser("asana-owner") as any).inputSchema;
    expect(
      schema.safeParse({ action: "list_workspaces", limit: 101 }).success,
    ).toBe(false);
    await execute({ action: "list_tasks", projectGid: "project-1", limit: 10 });
    expect(mocks.api).toHaveBeenCalledWith(
      "asana-owner",
      "asana",
      "/api/1.0/tasks",
      expect.objectContaining({ query: { project: "project-1", limit: 10 } }),
    );
  });
  it("rejects task creation without a matching approval", async () => {
    const result = await execute({
      action: "create_task",
      projectGid: "project-1",
      name: "Task",
      notes: "Exact notes",
      approvalToken: "h".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("asana-owner", "h".repeat(43), {
      provider: "asana",
      action: "create_task",
      payload: { projectGid: "project-1", name: "Task", notes: "Exact notes" },
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("creates only the exact approved task and returns generic provider failures", async () => {
    mocks.consume.mockResolvedValue(true);
    await execute({
      action: "create_task",
      projectGid: "project-1",
      name: "Task",
      notes: "Exact notes",
      approvalToken: "i".repeat(43),
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "asana-owner",
      "asana",
      "/api/1.0/tasks",
      expect.objectContaining({
        method: "POST",
        body: {
          data: { name: "Task", notes: "Exact notes", projects: ["project-1"] },
        },
      }),
    );
    mocks.api.mockRejectedValueOnce(new Error("private response details"));
    expect(await execute({ action: "get_task", taskGid: "task-1" })).toEqual({
      error: "Asana action failed",
    });
  });
});
