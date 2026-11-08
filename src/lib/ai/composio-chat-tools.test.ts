import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type ComposioChatDependencies,
  createComposioChatTools,
} from "./composio-chat-tools";

const account = {
  id: "owned-account-id",
  alias: "My GitHub",
  toolkit: { slug: "github" },
} as any;
const readAction = {
  slug: "GITHUB_LIST_REPOSITORIES",
  name: "List repositories",
  description: "List repositories available to the connected account.",
  toolkit: { slug: "github" },
  inputParameters: {
    type: "object",
    properties: { owner: { type: "string", maxLength: 100 } },
    required: ["owner"],
    additionalProperties: false,
  },
} as any;

function setup(overrides: Partial<ComposioChatDependencies> = {}) {
  const deps: ComposioChatDependencies = {
    configured: vi.fn(() => true),
    listAccounts: vi.fn(async () => [account]),
    listActions: vi.fn(async () => [readAction]),
    execute: vi.fn(async () => ({
      successful: true,
      data: { repositories: ["repo-a"] },
    })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    ...overrides,
  };
  const tools = createComposioChatTools("user-123", deps);
  return { deps, tools };
}

const call = async (tool: unknown, input: unknown) =>
  (tool as { execute: (value: unknown) => Promise<unknown> }).execute(input);

describe("Composio chat read tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only read actions using request-local opaque refs and no credential fields", async () => {
    const { tools, deps } = setup({
      listActions: vi.fn(
        async () =>
          [
            readAction,
            {
              ...readAction,
              slug: "GITHUB_CREATE_REPOSITORY",
              name: "Create repository",
            },
            {
              ...readAction,
              slug: "GITHUB_GET_TOKEN",
              inputParameters: {
                type: "object",
                properties: { access_token: { type: "string" } },
              },
            },
          ] as any,
      ),
    });
    expect(tools).toHaveProperty("composioSearchWriteActions");
    expect(tools).toHaveProperty("proposeComposioWriteAction");
    expect(tools).toHaveProperty("composioExecuteApprovedWriteAction");
    const listed = (await call(tools.composioSearchReadActions, {})) as any;

    expect(listed.accounts).toEqual([
      { accountRef: "account_1", toolkit: "github" },
    ]);
    expect(listed.actions.map((action: any) => action.actionSlug)).toEqual([
      "GITHUB_LIST_REPOSITORIES",
    ]);
    expect(JSON.stringify(listed)).not.toContain("owned-account-id");
    expect(JSON.stringify(listed)).not.toContain("access_token");
    expect(deps.listAccounts).toHaveBeenCalledWith("user-123");
  });

  it("executes a listed read action only against the user's active owned account", async () => {
    const { tools, deps } = setup();
    await call(tools.composioSearchReadActions, {});
    const output = (await call(tools.composioExecuteReadAction, {
      accountRef: "account_1",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: "my-org" },
    })) as any;

    expect(output.success).toBe(true);
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        connectedAccountId: "owned-account-id",
        tool: readAction,
        arguments: { owner: "my-org" },
      }),
    );
    expect(deps.rateLimit).toHaveBeenCalledWith("user-123");
  });

  it("binds actions to each connected account when multiple accounts share one toolkit", async () => {
    const secondAccount = {
      ...account,
      id: "second-owned-account",
      alias: "Second GitHub",
    };
    const { tools, deps } = setup({
      listAccounts: vi.fn(async () => [account, secondAccount]),
    });
    const listed = (await call(tools.composioSearchReadActions, {})) as any;
    expect(listed.actions.map((action: any) => action.accountRef)).toEqual([
      "account_1",
      "account_2",
    ]);

    const output = (await call(tools.composioExecuteReadAction, {
      accountRef: "account_2",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: "my-org" },
    })) as any;

    expect(output.success).toBe(true);
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: "second-owned-account" }),
    );
  });

  it("rate limits catalog discovery and caps repeated metadata calls per chat", async () => {
    const { tools, deps } = setup();
    await call(tools.composioSearchReadActions, {});
    await call(tools.composioSearchReadActions, {});
    await call(tools.composioSearchReadActions, {});
    const limited = await call(tools.composioSearchReadActions, {});

    expect(limited).toMatchObject({ success: false });
    expect(deps.listActions).toHaveBeenCalledTimes(3);
    expect(deps.rateLimit).toHaveBeenCalledTimes(3);
  });

  it("does not enumerate accounts when the catalog rate limit is exceeded", async () => {
    const { tools, deps } = setup({
      rateLimit: vi.fn(async () => ({ allowed: false })),
    });
    expect(await call(tools.composioSearchReadActions, {})).toMatchObject({
      success: false,
    });
    expect(deps.listAccounts).not.toHaveBeenCalled();
    expect(deps.listActions).not.toHaveBeenCalled();
  });

  it("rejects raw foreign account IDs and unlisted write-ish action slugs", async () => {
    const { tools, deps } = setup();
    await call(tools.composioSearchReadActions, {});
    const foreign = await call(tools.composioExecuteReadAction, {
      accountRef: "foreign-account-id",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: "org" },
    });
    const write = await call(tools.composioExecuteReadAction, {
      accountRef: "account_1",
      actionSlug: "GITHUB_CREATE_REPOSITORY",
      arguments: { owner: "org" },
    });

    expect(foreign).toMatchObject({ success: false });
    expect(write).toMatchObject({ success: false });
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed action arguments before rate limiting or execution", async () => {
    const { tools, deps } = setup();
    await call(tools.composioSearchReadActions, {});
    vi.mocked(deps.rateLimit).mockClear();
    const result = await call(tools.composioExecuteReadAction, {
      accountRef: "account_1",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: 42, extra: "not permitted" },
    });

    expect(result).toMatchObject({
      success: false,
      error: "Action arguments do not match its schema.",
    });
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("fails closed when Composio is not configured", async () => {
    const { tools, deps } = setup({ configured: vi.fn(() => false) });
    expect(await call(tools.composioSearchReadActions, {})).toMatchObject({
      success: false,
    });
    expect(
      await call(tools.composioExecuteReadAction, {
        accountRef: "account_1",
        actionSlug: "GITHUB_LIST_REPOSITORIES",
        arguments: { owner: "org" },
      }),
    ).toMatchObject({ success: false });
    expect(deps.listAccounts).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("rechecks ownership and active connection state before calling Composio", async () => {
    const { tools, deps } = setup({
      listAccounts: vi
        .fn()
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce([]),
    });
    await call(tools.composioSearchReadActions, {});
    const result = await call(tools.composioExecuteReadAction, {
      accountRef: "account_1",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: "org" },
    });

    expect(result).toMatchObject({
      success: false,
      error: "This connection is no longer available to you.",
    });
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("redacts credential fields from action output", async () => {
    const { tools, deps } = setup({
      execute: vi.fn(async () => ({
        successful: true,
        data: { result: "ok", access_token: "do-not-leak" },
      })),
    });
    await call(tools.composioSearchReadActions, {});
    const output = JSON.stringify(
      await call(tools.composioExecuteReadAction, {
        accountRef: "account_1",
        actionSlug: "GITHUB_LIST_REPOSITORIES",
        arguments: { owner: "org" },
      }),
    );

    expect(output).toContain("ok");
    expect(output).not.toContain("do-not-leak");
    expect(output).not.toContain("access_token");
    expect(deps.execute).toHaveBeenCalledOnce();
  });
});
