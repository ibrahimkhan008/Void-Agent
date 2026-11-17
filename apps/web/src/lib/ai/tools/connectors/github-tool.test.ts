import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { consume: mocks.consume },
  }),
);

import { connectorActionApprovalSchema } from "../hitl/connector-action-approval";
import { createGitHubToolForUser } from "./github-tool";

const execute = (input: Record<string, unknown>) =>
  (createGitHubToolForUser("user-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
});

describe("GitHub connector tool — reads", () => {
  it("returns a bounded pull-request view", async () => {
    mocks.api.mockResolvedValue({
      number: 42,
      title: "Fix inventory",
      state: "open",
      draft: false,
      user: { login: "octodev" },
      head: { ref: "fix/inventory", sha: "d3adb33f" },
      base: { ref: "main" },
      additions: 12,
      deletions: 3,
      changed_files: 2,
      mergeable: true,
      html_url: "https://github.com/acme/widgets/pull/42",
      body: "x".repeat(20_000),
    });
    const result = await execute({
      action: "get_pr",
      repository: "acme/widgets",
      pullNumber: 42,
    });
    expect(result).toMatchObject({
      number: 42,
      title: "Fix inventory",
      author: "octodev",
      head: "fix/inventory",
      base: "main",
    });
    // The 20k body is truncated, not passed through.
    expect(result.body.length).toBeLessThanOrEqual(8_100);
    expect(result.body).toContain("…[truncated]");
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/pulls/42",
    );
  });

  it("bounds the changed-file list and truncates long patches", async () => {
    const files = Array.from({ length: 30 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      status: "modified",
      additions: index,
      deletions: 0,
      patch: "line\n".repeat(6_000),
    }));
    mocks.api.mockResolvedValue(files);
    const result = await execute({
      action: "get_pr_files",
      repository: "acme/widgets",
      pullNumber: 42,
    });
    expect(result.files).toHaveLength(20);
    expect(result.files[0].patch.split("\n").length).toBeLessThan(6_000);
    expect(result.files[0].patch).toContain("…[truncated]");
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/pulls/42/files",
      expect.anything(),
    );
  });

  it("decodes file content with a size cap and reports the blob sha", async () => {
    mocks.api.mockResolvedValue({
      path: "src/inventory.sql",
      sha: "abc123def456",
      size: 4096,
      encoding: "base64",
      content: Buffer.from("SELECT * FROM inventory;", "utf8").toString(
        "base64",
      ),
    });
    const result = await execute({
      action: "get_file",
      repository: "acme/widgets",
      path: "src/inventory.sql",
      ref: "main",
    });
    expect(result).toMatchObject({
      path: "src/inventory.sql",
      sha: "abc123def456",
      content: "SELECT * FROM inventory;",
      truncated: false,
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/contents/src/inventory.sql",
      expect.anything(),
    );
  });

  it("refuses directory listings instead of passing them through", async () => {
    mocks.api.mockResolvedValue([
      { path: "src", type: "dir" },
      { path: "README.md", type: "file" },
    ]);
    const result = await execute({
      action: "get_file",
      repository: "acme/widgets",
      path: "src",
    });
    expect(result.error).toContain("directory");
  });
});

describe("GitHub connector tool — approved writes", () => {
  it("never updates a file without the exact owner-bound approval", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({
      action: "update_file",
      repository: "acme/widgets",
      path: "src/inventory.sql",
      branchName: "fix/inventory",
      fileSha: "abc123def456",
      commitMessage: "Fix the inventory query",
      fileContent: "SELECT id FROM inventory;",
      approvalToken: "a".repeat(43),
    });
    expect(result.error).toContain("not been approved");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith("user-owner", "a".repeat(43), {
      provider: "github",
      action: "update_file",
      payload: {
        repository: "acme/widgets",
        path: "src/inventory.sql",
        branchName: "fix/inventory",
        fileSha: "abc123def456",
        commitMessage: "Fix the inventory query",
        fileContent: "SELECT id FROM inventory;",
      },
    });
  });

  it("updates the file with base64 content on the approved branch", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockResolvedValue({
      commit: { sha: "cafe1234" },
      content: { sha: "abc123def456" },
    });
    const result = await execute({
      action: "update_file",
      repository: "acme/widgets",
      path: "src/inventory.sql",
      branchName: "fix/inventory",
      fileSha: "abc123def456",
      commitMessage: "Fix the inventory query",
      fileContent: "SELECT id FROM inventory;",
      approvalToken: "a".repeat(43),
    });
    expect(result.commit).toMatchObject({ sha: "cafe1234" });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/contents/src/inventory.sql",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          message: "Fix the inventory query",
          content: Buffer.from("SELECT id FROM inventory;", "utf8").toString(
            "base64",
          ),
          sha: "abc123def456",
          branch: "fix/inventory",
        }),
      }),
    );
  });

  it("creates the approved pull request and returns a bounded view", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockResolvedValue({
      number: 43,
      title: "Fix inventory",
      state: "open",
      draft: false,
      user: { login: "octodev" },
      head: { ref: "fix/inventory", sha: "cafe1234" },
      base: { ref: "main" },
      html_url: "https://github.com/acme/widgets/pull/43",
      body: "Fixes the query.",
    });
    const result = await execute({
      action: "create_pull_request",
      repository: "acme/widgets",
      title: "Fix inventory",
      headRef: "fix/inventory",
      baseBranch: "main",
      body: "Fixes the query.",
      approvalToken: "b".repeat(43),
    });
    expect(result).toMatchObject({ number: 43, head: "fix/inventory" });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/pulls",
      expect.objectContaining({
        method: "POST",
        body: {
          title: "Fix inventory",
          head: "fix/inventory",
          base: "main",
          body: "Fixes the query.",
        },
      }),
    );
  });

  it("posts the approved review as a COMMENT event", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockResolvedValue({ id: 9_001, state: "COMMENTED" });
    const result = await execute({
      action: "create_pr_review",
      repository: "acme/widgets",
      pullNumber: 42,
      body: "Found 2 issues: off-by-one in the pagination query; unbounded LIMIT.",
      approvalToken: "c".repeat(43),
    });
    expect(result).toMatchObject({ id: 9_001 });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/pulls/42/reviews",
      expect.objectContaining({
        method: "POST",
        body: {
          event: "COMMENT",
          body: "Found 2 issues: off-by-one in the pagination query; unbounded LIMIT.",
        },
      }),
    );
  });

  it("creates the approved branch from the pinned sha", async () => {
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockResolvedValue({ ref: "refs/heads/fix/inventory" });
    const result = await execute({
      action: "create_branch",
      repository: "acme/widgets",
      branchName: "fix/inventory",
      fromSha: "d3adb33fc0ffee00000000000000000000000001",
      approvalToken: "d".repeat(43),
    });
    expect(result).toMatchObject({ ref: "refs/heads/fix/inventory" });
    expect(mocks.api).toHaveBeenCalledWith(
      "user-owner",
      "github",
      "/repos/acme/widgets/git/refs",
      expect.objectContaining({
        method: "POST",
        body: {
          ref: "refs/heads/fix/inventory",
          sha: "d3adb33fc0ffee00000000000000000000000001",
        },
      }),
    );
  });
});

describe("GitHub approval payloads in the HITL schema", () => {
  it("accepts every exact github write payload", () => {
    const payloads = [
      {
        provider: "github",
        action: "create_branch",
        payload: {
          repository: "acme/widgets",
          branchName: "fix/inventory",
          fromSha: "d3adb33f",
        },
      },
      {
        provider: "github",
        action: "update_file",
        payload: {
          repository: "acme/widgets",
          path: "src/inventory.sql",
          branchName: "fix/inventory",
          fileSha: "abc123def456",
          commitMessage: "Fix the inventory query",
          fileContent: "SELECT id FROM inventory;",
        },
      },
      {
        provider: "github",
        action: "create_pull_request",
        payload: {
          repository: "acme/widgets",
          title: "Fix inventory",
          headRef: "fix/inventory",
          baseBranch: "main",
          body: "Fixes the query.",
        },
      },
      {
        provider: "github",
        action: "create_pr_review",
        payload: {
          repository: "acme/widgets",
          pullNumber: 42,
          body: "Found 2 issues.",
        },
      },
    ];
    for (const payload of payloads) {
      expect(connectorActionApprovalSchema.safeParse(payload).success).toBe(
        true,
      );
    }
  });

  it("rejects traversal paths and out-of-bounds pull numbers", () => {
    const badPath = connectorActionApprovalSchema.safeParse({
      provider: "github",
      action: "update_file",
      payload: {
        repository: "acme/widgets",
        path: "../escape.sql",
        branchName: "main",
        fileSha: "abc123def456",
        commitMessage: "nope",
        fileContent: "nope",
      },
    });
    expect(badPath.success).toBe(false);
    const badPull = connectorActionApprovalSchema.safeParse({
      provider: "github",
      action: "create_pr_review",
      payload: {
        repository: "acme/widgets",
        pullNumber: 0,
        body: "nope",
      },
    });
    expect(badPull.success).toBe(false);
  });
});
