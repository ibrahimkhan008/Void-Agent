import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type ComposioVoiceDependencies,
  createComposioVoiceActions,
} from "./composio-voice-tools";

const ownedAccount = {
  id: "raw-connected-account-id",
  alias: "Personal workspace",
  toolkit: { slug: "github" },
} as any;
const readAction = {
  slug: "GITHUB_LIST_REPOSITORIES",
  name: "List repositories",
  description: "Read repository metadata.",
  toolkit: { slug: "github" },
  inputParameters: {
    type: "object",
    properties: { owner: { type: "string", maxLength: 50 } },
    required: ["owner"],
    additionalProperties: false,
  },
} as any;

type SearchSuccess = {
  success: true;
  actions: Array<Record<string, unknown>>;
  truncated: boolean;
};

type ExecuteSuccess = {
  success: true;
  result: string;
  untrustedData: true;
};

function assertSearchSuccess(value: unknown): asserts value is SearchSuccess {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { success?: unknown }).success !== true ||
    !Array.isArray((value as { actions?: unknown }).actions)
  ) {
    throw new Error("Expected a successful Composio action search");
  }
}

function assertExecuteSuccess(value: unknown): asserts value is ExecuteSuccess {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { success?: unknown }).success !== true ||
    typeof (value as { result?: unknown }).result !== "string" ||
    (value as { untrustedData?: unknown }).untrustedData !== true
  ) {
    throw new Error("Expected a successful Composio action execution");
  }
}

function setup(overrides: Partial<ComposioVoiceDependencies> = {}) {
  const deps: ComposioVoiceDependencies = {
    configured: vi.fn(() => true),
    listAccounts: vi.fn(async () => [ownedAccount]),
    listActions: vi.fn(async () => [readAction]),
    execute: vi.fn(async () => ({
      successful: true,
      data: { repo: "demo", api_token: "must-not-escape" },
    })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    seal: (value) => Buffer.from(value, "utf8").toString("base64"),
    unseal: (value) => Buffer.from(value, "base64").toString("utf8"),
    now: () => 1_000,
    ...overrides,
  };
  return { deps, actions: createComposioVoiceActions("user-123", deps) };
}

describe("Composio voice read actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only safe read actions and never returns the raw account id", async () => {
    const { actions, deps } = setup({
      listActions: vi.fn(
        async () =>
          [
            readAction,
            { ...readAction, slug: "GITHUB_CREATE_REPOSITORY" },
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

    const result = await actions.search({ query: "repository" });
    expect(result.success).toBe(true);
    assertSearchSuccess(result);
    expect(result.actions).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(ownedAccount.id);
    expect(result.actions[0]).toMatchObject({
      actionSlug: readAction.slug,
      toolkit: "github",
    });
    expect(deps.listAccounts).toHaveBeenCalledWith("user-123");
    expect(deps.rateLimit).toHaveBeenCalledWith("user-123", "search");
  });

  it("executes only a listed read action and rechecks the active owner connection", async () => {
    const { actions, deps } = setup();
    const listed = await actions.search({});
    assertSearchSuccess(listed);
    const reference = listed.actions[0].accountRef as string;
    const result = await actions.execute({
      accountRef: reference,
      actionSlug: readAction.slug,
      arguments: { owner: "acme" },
    });

    expect(result.success).toBe(true);
    assertExecuteSuccess(result);
    expect(result.untrustedData).toBe(true);
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
    expect(deps.listAccounts).toHaveBeenCalledTimes(2);
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        connectedAccountId: ownedAccount.id,
        tool: readAction,
        arguments: { owner: "acme" },
      }),
    );
  });

  it("rejects an account reference minted for a different user", async () => {
    const source = setup();
    const listed = await source.actions.search({});
    assertSearchSuccess(listed);
    const reference = listed.actions[0].accountRef as string;
    const otherUser = createComposioVoiceActions("user-456", source.deps);

    const result = await otherUser.execute({
      accountRef: reference,
      actionSlug: readAction.slug,
      arguments: { owner: "acme" },
    });

    expect(result.success).toBe(false);
    expect(source.deps.execute).not.toHaveBeenCalled();
  });

  it("rejects expired, revoked, and malformed references", async () => {
    const expired = setup();
    const expiredListing = await expired.actions.search({});
    assertSearchSuccess(expiredListing);
    expired.deps.now = () => 30 * 60_000;
    expect(
      await expired.actions.execute({
        accountRef: expiredListing.actions[0].accountRef,
        actionSlug: readAction.slug,
        arguments: { owner: "acme" },
      }),
    ).toMatchObject({ success: false });

    const revoked = setup();
    const revokedListing = await revoked.actions.search({});
    assertSearchSuccess(revokedListing);
    vi.mocked(revoked.deps.listAccounts).mockResolvedValueOnce([]);
    expect(
      await revoked.actions.execute({
        accountRef: revokedListing.actions[0].accountRef,
        actionSlug: readAction.slug,
        arguments: { owner: "acme" },
      }),
    ).toMatchObject({ success: false });
    expect(revoked.deps.execute).not.toHaveBeenCalled();

    const malformed = setup();
    expect(
      await malformed.actions.execute({
        accountRef: "not-a-valid-reference",
        actionSlug: readAction.slug,
        arguments: { owner: "acme" },
      }),
    ).toMatchObject({ success: false });
  });

  it("blocks mutating actions and invalid schemas before execution", async () => {
    const { actions, deps } = setup();
    const listed = await actions.search({});
    assertSearchSuccess(listed);
    const reference = listed.actions[0].accountRef as string;

    expect(
      await actions.execute({
        accountRef: reference,
        actionSlug: "GITHUB_CREATE_REPOSITORY",
        arguments: { owner: "acme" },
      }),
    ).toMatchObject({ success: false });
    expect(
      await actions.execute({
        accountRef: reference,
        actionSlug: readAction.slug,
        arguments: { owner: 42 },
      }),
    ).toMatchObject({ success: false });
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("applies rate limits to both discovery and execution", async () => {
    const { actions, deps } = setup({
      rateLimit: vi.fn(async () => ({ allowed: false })),
    });
    expect(await actions.search({})).toMatchObject({ success: false });
    expect(deps.listAccounts).not.toHaveBeenCalled();

    const available = setup();
    const listed = await available.actions.search({});
    assertSearchSuccess(listed);
    vi.mocked(available.deps.rateLimit).mockResolvedValueOnce({
      allowed: false,
    });
    expect(
      await available.actions.execute({
        accountRef: listed.actions[0].accountRef,
        actionSlug: readAction.slug,
        arguments: { owner: "acme" },
      }),
    ).toMatchObject({ success: false });
    expect(available.deps.execute).not.toHaveBeenCalled();
  });

  it("bounds action listings and result content", async () => {
    const manyActions = Array.from({ length: 20 }, (_, index) => ({
      ...readAction,
      slug: `GITHUB_LIST_REPOSITORIES_${index}`,
      name: `List repositories ${index}`,
    })) as any;
    const bounded = setup({ listActions: vi.fn(async () => manyActions) });
    const listed = await bounded.actions.search({});
    assertSearchSuccess(listed);
    expect(listed.actions).toHaveLength(8);
    expect(listed.truncated).toBe(true);

    const large = setup({
      execute: vi.fn(async () => ({
        successful: true,
        data: "x".repeat(20_000),
      })),
    });
    const largeListing = await large.actions.search({});
    assertSearchSuccess(largeListing);
    const result = await large.actions.execute({
      accountRef: largeListing.actions[0].accountRef,
      actionSlug: readAction.slug,
      arguments: { owner: "acme" },
    });
    expect(result.success).toBe(true);
    assertExecuteSuccess(result);
    expect(result.result.length).toBeLessThan(8_100);
    expect(result.untrustedData).toBe(true);
  });
});
