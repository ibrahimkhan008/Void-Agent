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
import { createJiraToolForUser } from "./jira-tool";

const cloudId = "1324a887-45db-1bf4-1e99-ef0ff456d421";
const execute = (input: Record<string, unknown>) =>
  (createJiraToolForUser("jira-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ values: [], issues: [], id: "comment-1" });
});

describe("Jira connector", () => {
  it("bounds user inputs and uses only the fixed Atlassian API path", async () => {
    const schema = (createJiraToolForUser("jira-owner") as any).inputSchema;
    expect(
      schema.safeParse({
        action: "get_issue",
        cloudId: "https://attacker.invalid",
        issueKey: "ABC-1",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ action: "list_projects", cloudId, limit: 101 })
        .success,
    ).toBe(false);
    expect(
      await execute({ action: "get_issue", cloudId, issueKey: "ABC-1" }),
    ).toEqual({ values: [], issues: [], id: "comment-1" });
    expect(mocks.api).toHaveBeenCalledWith(
      "jira-owner",
      "jira",
      `/ex/jira/${cloudId}/rest/api/3/issue/ABC-1`,
    );
  });
  it("requires owner-scoped exact approval and executes only the reviewed comment", async () => {
    const payload = { cloudId, issueKey: "ABC-1", comment: "Reviewed comment" };
    expect(
      await execute({
        action: "add_comment",
        ...payload,
        approvalToken: "j".repeat(43),
      }),
    ).toMatchObject({ error: expect.stringContaining("not been approved") });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith("jira-owner", "j".repeat(43), {
      provider: "jira",
      action: "add_comment",
      payload,
    });
    mocks.consume.mockResolvedValue(true);
    expect(
      await execute({
        action: "add_comment",
        ...payload,
        approvalToken: "k".repeat(43),
      }),
    ).toEqual({
      success: true,
      comment: { values: [], issues: [], id: "comment-1" },
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "jira-owner",
      "jira",
      `/ex/jira/${cloudId}/rest/api/3/issue/ABC-1/comment`,
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("fails closed on provider errors without returning provider response data", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockRejectedValue(new Error("sensitive upstream body"));
    expect(
      await execute({
        action: "add_comment",
        cloudId,
        issueKey: "ABC-1",
        comment: "text",
        approvalToken: "m".repeat(43),
      }),
    ).toEqual({ error: "Jira action failed" });
  });
});
