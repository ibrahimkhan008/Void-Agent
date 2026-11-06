import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.WINDMILL_URL = "https://windmill.test";
  process.env.WINDMILL_TOKEN = "server-secret";
  process.env.WINDMILL_WORKSPACE = "team";
  return { consume: vi.fn(), fetch: vi.fn() };
});
vi.mock("lib/db/pg/repositories/workflow-run-approval-repository.pg", () => ({ workflowRunApprovalRepository: { consume: mocks.consume } }));

import { createWorkflowToolForUser } from "./workflow";

const execute = (input: unknown) => {
  const created = createWorkflowToolForUser("user-1") as unknown as { execute: (value: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: "job-1" }) });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("configured workflow execution approval", () => {
  it("fails closed before external execution when approval is missing or stale", async () => {
    const result = await execute({ platform: "windmill", action: "run", target: "u/team/deploy", payload: { version: "1.2" } }) as { error?: string };
    expect(result.error).toContain("fresh approval");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("consumes exact owner-bound reviewed fields before invoking Windmill", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({ platform: "windmill", action: "run", target: "u/team/deploy", payload: { version: "1.2" }, approvalToken: "t".repeat(48) }) as { ok?: boolean };
    expect(result.ok).toBe(true);
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "t".repeat(48), { platform: "windmill", target: "u/team/deploy", payload: { version: "1.2" } });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ version: "1.2" }));
  });

  it("keeps discovery read-only and available without approval", async () => {
    const result = await execute({ platform: "windmill", action: "list_scripts" }) as { ok?: boolean };
    expect(result.ok).toBe(true);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});
