import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/linear-approval-repository.pg", () => ({
  linearApprovalRepository: { consume: mocks.consume },
}));

import { createLinearToolForUser } from "./linear-tool";

const draft = { action: "create_issue", teamId: "00000000-0000-4000-8000-000000000001", title: "Fix launch blocker", description: "Investigate." };

async function execute(input: unknown) {
  const created = createLinearToolForUser("user-1") as unknown as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("linear-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { id: "issue-1" } } } }), { status: 200 })));
});

describe("Linear issue creation approvals", () => {
  it("blocks issue creation without an approved payload before any provider call", async () => {
    const result = await execute(draft) as { error?: string };
    expect(result.error).toContain("user-reviewed approval");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes the exact approval before calling Linear", async () => {
    const result = await execute({ ...draft, approvalToken: "x".repeat(40) }) as { success?: boolean };
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "x".repeat(40), {
      teamId: draft.teamId,
      title: draft.title,
      description: draft.description,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("refuses expired/replayed approvals and parameterizes issue state filters", async () => {
    mocks.consume.mockResolvedValue(false);
    await execute({ ...draft, approvalToken: "y".repeat(40) });
    expect(fetch).not.toHaveBeenCalled();
    await execute({ action: "list_issues", teamId: draft.teamId, state: '\" } ) { issueCreate(input: { title: "attack" }) } #' });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(body.query).not.toContain("attack");
    expect(body.variables.state).toContain("attack");
  });
});
