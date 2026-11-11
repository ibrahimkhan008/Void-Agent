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
import { createLinearToolForUser } from "./linear-tool";

const execute = (input: Record<string, unknown>) =>
  (createLinearToolForUser("linear-owner") as any).execute(input, {});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({
    data: {
      issueCreate: {
        success: true,
        issue: { id: "issue-1", identifier: "ABC-1", title: "Exact title" },
      },
    },
  });
});

describe("Linear connector", () => {
  it("rejects unbounded lists and issues a read through the owner-scoped API", async () => {
    const schema = (createLinearToolForUser("linear-owner") as any).inputSchema;
    expect(schema.safeParse({ action: "list_teams", limit: 101 }).success).toBe(
      false,
    );
    await execute({ action: "list_teams", limit: 10 });
    expect(mocks.api).toHaveBeenCalledWith(
      "linear-owner",
      "linear",
      "/graphql",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ variables: { first: 10 } }),
      }),
    );
  });
  it("rejects issue creation without exact approval", async () => {
    const result = await execute({
      action: "create_issue",
      teamId: "team-1",
      title: "Exact title",
      description: "Exact description",
      approvalToken: "l".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("linear-owner", "l".repeat(43), {
      provider: "linear",
      action: "create_issue",
      payload: {
        teamId: "team-1",
        title: "Exact title",
        description: "Exact description",
      },
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("creates only the exact approved issue and fails closed on GraphQL errors", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "create_issue",
      teamId: "team-1",
      title: "Exact title",
      description: "Exact description",
      approvalToken: "m".repeat(43),
    });
    expect(result).toEqual({
      success: true,
      result: {
        success: true,
        issue: { id: "issue-1", identifier: "ABC-1", title: "Exact title" },
      },
    });
    const [owner, provider, path, options] = mocks.api.mock.calls[0];
    expect([owner, provider, path]).toEqual([
      "linear-owner",
      "linear",
      "/graphql",
    ]);
    expect(options.body.variables.input).toEqual({
      teamId: "team-1",
      title: "Exact title",
      description: "Exact description",
    });
    mocks.api.mockResolvedValueOnce({ errors: [{ message: "do not leak" }] });
    expect(await execute({ action: "list_teams", limit: 5 })).toEqual({
      error: "Linear could not complete this request",
    });
  });
});
