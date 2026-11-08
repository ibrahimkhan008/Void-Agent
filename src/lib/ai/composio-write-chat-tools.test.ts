import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/composio", () => ({
  executeApprovedComposioAction: vi.fn(),
  executeComposioReadAction: vi.fn(),
  isComposioConfigured: vi.fn(() => true),
  isWriteComposioAction: (slug: string) =>
    /(^|_)(CREATE|UPDATE|DELETE|SEND)(_|$)/i.test(slug),
  listComposioAccountsForUser: vi.fn(),
  listComposioReadActions: vi.fn(),
  listComposioActions: vi.fn(),
}));
vi.mock("./composio-chat-tools", () => ({
  redactComposioSensitiveFields: (value: unknown) => value,
  safeComposioActionSchema: (action: any) => action.inputParameters,
}));
vi.mock("lib/ai/tools/hitl/composio-write-approval", () => ({
  composioWriteApprovalRequestSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  createComposioAccountReference: vi.fn(
    () => `account-reference-${"x".repeat(40)}`,
  ),
  fingerprintComposioActionSchema: vi.fn(() => "a".repeat(64)),
  getComposioAccountLabel: vi.fn(({ alias, toolkitSlug }: any) =>
    typeof alias === "string" ? alias : `${toolkitSlug} connection`,
  ),
  resolveComposioAccountReference: vi.fn(() => ({
    userId: "user-1",
    connectedAccountId: "account-1",
    toolkitSlug: "github",
    accountLabel: "Work GitHub",
  })),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import {
  type ComposioWriteChatDependencies,
  createComposioWriteChatTools,
} from "./composio-write-chat-tools";

const account = {
  id: "account-1",
  alias: "Work GitHub",
  toolkit: { slug: "github" },
} as any;
const writeAction = {
  slug: "GITHUB_CREATE_ISSUE",
  name: "Create issue",
  description: "Create a GitHub issue.",
  version: "1",
  inputParameters: {
    type: "object",
    properties: { title: { type: "string", minLength: 1, maxLength: 100 } },
    required: ["title"],
    additionalProperties: false,
  },
} as any;
const readAction = {
  ...writeAction,
  slug: "GITHUB_LIST_ISSUES",
  name: "List issues",
} as any;
const accountRef = `account-reference-${"x".repeat(40)}`;

function setup(overrides: Partial<ComposioWriteChatDependencies> = {}) {
  const dependencies: ComposioWriteChatDependencies = {
    configured: vi.fn(() => true),
    listAccounts: vi.fn(async () => [account]),
    listActions: vi.fn(async () => [readAction, writeAction]),
    execute: vi.fn(async () => ({ successful: true, data: { number: 12 } })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    createAccountRef: vi.fn(() => accountRef),
    resolveAccountRef: vi.fn(() => ({
      userId: "user-1",
      connectedAccountId: "account-1",
      toolkitSlug: "github",
      accountLabel: "Work GitHub",
    })),
    ...overrides,
  };
  return {
    dependencies,
    tools: createComposioWriteChatTools("user-1", dependencies),
  };
}

const call = (tool: unknown, input: unknown) =>
  (
    tool as { execute: (value: unknown, options?: unknown) => Promise<unknown> }
  ).execute(input);

describe("Composio write action review and execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only recognized write actions with opaque owner-bound references", async () => {
    const { dependencies, tools } = setup();
    const listed = (await call(tools.composioSearchWriteActions, {})) as any;

    expect(listed.actions.map((action: any) => action.actionSlug)).toEqual([
      "GITHUB_CREATE_ISSUE",
    ]);
    expect(listed.actions[0]).toMatchObject({
      accountRef,
      accountLabel: "Work GitHub",
      toolkitSlug: "github",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
    });
    expect(JSON.stringify(listed)).not.toContain("account-1");
    expect(dependencies.listAccounts).toHaveBeenCalledWith("user-1");
  });

  it("executes only after current owner, action, schema and exact one-use token checks", async () => {
    const { dependencies, tools } = setup();
    const result = (await call(tools.composioExecuteApprovedWriteAction, {
      accountRef,
      accountLabel: "Work GitHub",
      toolkitSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
      arguments: { title: "Approved title" },
      approvalToken: "single-use-approval-token",
    })) as any;

    expect(result.success).toBe(true);
    expect(dependencies.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        connectedAccountId: "account-1",
        toolkitSlug: "github",
        tool: writeAction,
        approvalToken: "single-use-approval-token",
        approvalRequest: expect.objectContaining({
          actionSlug: "GITHUB_CREATE_ISSUE",
          arguments: { title: "Approved title" },
        }),
      }),
    );
  });

  it("fails closed when the atomic approval consumer rejects an absent, expired, replayed, or altered token", async () => {
    const { dependencies, tools } = setup({
      execute: vi.fn(async () => {
        throw new Error("Approval is missing, expired, or already used");
      }),
    });
    const result = (await call(tools.composioExecuteApprovedWriteAction, {
      accountRef,
      accountLabel: "Work GitHub",
      toolkitSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
      arguments: { title: "Altered after review" },
      approvalToken: "used-or-invalid-token",
    })) as any;

    expect(result).toMatchObject({ success: false });
    expect(dependencies.execute).toHaveBeenCalledOnce();
    expect(dependencies.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalToken: "used-or-invalid-token",
        approvalRequest: expect.objectContaining({
          arguments: { title: "Altered after review" },
        }),
      }),
    );
  });

  it("does not consume approval when the current action version or schema changed", async () => {
    const changedAction = { ...writeAction, version: "2" };
    const { dependencies, tools } = setup({
      listActions: vi.fn(async () => [changedAction]),
    });
    const result = (await call(tools.composioExecuteApprovedWriteAction, {
      accountRef,
      accountLabel: "Work GitHub",
      toolkitSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
      arguments: { title: "Reviewed title" },
      approvalToken: "single-use-approval-token",
    })) as any;

    expect(result.success).toBe(false);
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it("blocks execution when the account reference or current owner connection is invalid", async () => {
    const { dependencies, tools } = setup({
      resolveAccountRef: vi.fn(() => null),
    });
    const result = (await call(tools.composioExecuteApprovedWriteAction, {
      accountRef,
      accountLabel: "Work GitHub",
      toolkitSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
      arguments: { title: "Reviewed title" },
      approvalToken: "single-use-approval-token",
    })) as any;
    expect(result.success).toBe(false);
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it("rejects a forged account label before reaching the approval consumer", async () => {
    const { dependencies, tools } = setup();
    const result = (await call(tools.composioExecuteApprovedWriteAction, {
      accountRef,
      accountLabel: "Personal GitHub",
      toolkitSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      actionVersion: "1",
      schemaFingerprint: "a".repeat(64),
      arguments: { title: "Reviewed title" },
      approvalToken: "single-use-approval-token",
    })) as any;

    expect(result.success).toBe(false);
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
});
