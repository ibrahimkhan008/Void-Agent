import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createComposioAccountReference,
  fingerprintComposioActionSchema,
  getComposioAccountLabel,
} from "lib/ai/tools/hitl/composio-write-approval";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isConfigured: vi.fn(),
  rateLimit: vi.fn(),
  listAccounts: vi.fn(),
  getAction: vi.fn(),
  issue: vi.fn(),
}));

import { createComposioApprovalPostHandler } from "lib/ai/tools/hitl/composio-write-approval-route";

const schema = {
  type: "object",
  properties: {
    channel_id: { type: "string", maxLength: 100 },
    text: { type: "string", maxLength: 1_000 },
  },
  required: ["channel_id", "text"],
  additionalProperties: false,
};
const effect = {
  accountLabel: "Ops Workspace",
  toolkitSlug: "slack",
  actionSlug: "SLACK_SEND_MESSAGE",
  actionVersion: "2024-01-01",
  schemaFingerprint: fingerprintComposioActionSchema(schema),
  arguments: { channel_id: "C123", text: "Reviewed announcement" },
};

function makeRequest(
  body: unknown = {
    accountRef: createComposioAccountReference({
      userId: "user-1",
      connectedAccountId: "conn-1",
      toolkitSlug: "slack",
      accountLabel: "Ops Workspace",
    }),
    ...effect,
  },
  origin = "https://void-agent.test",
) {
  return new Request("https://void-agent.test/api/approvals/composio", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setup() {
  const dependencies = {
    getSession: mocks.getSession,
    isConfigured: mocks.isConfigured,
    rateLimit: mocks.rateLimit,
    listAccounts: mocks.listAccounts,
    getAction: mocks.getAction,
    issue: mocks.issue,
  } as const;
  return {
    handler: createComposioApprovalPostHandler(dependencies),
    dependencies,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-secret-for-composio-account-reference",
  );
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.isConfigured.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.listAccounts.mockResolvedValue([
    { id: "conn-1", alias: "Ops Workspace", toolkit: { slug: "slack" } },
  ]);
  mocks.getAction.mockResolvedValue({
    slug: effect.actionSlug,
    version: effect.actionVersion,
    inputParameters: schema,
  });
  mocks.issue.mockResolvedValue("opaque-composio-token");
});

describe("POST /api/approvals/composio", () => {
  it("issues a no-store token bound to the current owner, account, action, version, schema, and exact arguments", async () => {
    const { handler } = setup();
    const response = await handler(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      approvalToken: "opaque-composio-token",
    });
    expect(mocks.issue).toHaveBeenCalledWith("user-1", {
      userId: "user-1",
      connectedAccountId: "conn-1",
      ...effect,
    });
  });

  it("rejects unauthenticated, cross-origin, malformed, rate-limited, or unavailable requests before issuing", async () => {
    const { handler } = setup();
    mocks.getSession.mockResolvedValue(null);
    expect((await handler(makeRequest())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (await handler(makeRequest(undefined, "https://attacker.test"))).status,
    ).toBe(403);
    expect(
      (await handler(makeRequest({ ...effect, connectedAccountId: "conn-1" })))
        .status,
    ).toBe(400);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await handler(makeRequest())).status).toBe(429);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.isConfigured.mockReturnValue(false);
    expect((await handler(makeRequest())).status).toBe(503);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects account references for another user, another toolkit, or an account no longer owned and active", async () => {
    const { handler } = setup();
    const foreign = {
      accountRef: createComposioAccountReference({
        userId: "user-2",
        connectedAccountId: "conn-1",
        toolkitSlug: "slack",
        accountLabel: "Ops Workspace",
      }),
      ...effect,
    };
    expect((await handler(makeRequest(foreign))).status).toBe(404);
    const mismatchedToolkit = {
      accountRef: createComposioAccountReference({
        userId: "user-1",
        connectedAccountId: "conn-1",
        toolkitSlug: "github",
        accountLabel: "github connection Â·conn-1",
      }),
      ...effect,
    };
    expect((await handler(makeRequest(mismatchedToolkit))).status).toBe(404);
    mocks.listAccounts.mockResolvedValue([
      { id: "conn-foreign", toolkit: { slug: "slack" } },
    ]);
    expect((await handler(makeRequest())).status).toBe(404);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("requires the human-readable label to match the encrypted ref and current account", async () => {
    const { handler } = setup();
    const forgedLabel = {
      accountRef: createComposioAccountReference({
        userId: "user-1",
        connectedAccountId: "conn-1",
        toolkitSlug: "slack",
        accountLabel: "Ops Workspace",
      }),
      ...effect,
      accountLabel: "Another workspace",
    };
    expect((await handler(makeRequest(forgedLabel))).status).toBe(409);

    mocks.listAccounts.mockResolvedValue([
      {
        id: "conn-1",
        alias: "Different Workspace",
        toolkit: { slug: "slack" },
      },
    ]);
    expect((await handler(makeRequest())).status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("derives a bounded, control-free account fallback label", () => {
    expect(
      getComposioAccountLabel({
        id: "account-abcdef123456",
        toolkitSlug: "slack",
      }),
    ).toBe("slack connection \u00b7123456");
    expect(
      getComposioAccountLabel({
        id: "account-1",
        toolkitSlug: "slack",
        alias: "\u0000 Ops\n Team ",
      }),
    ).toBe("Ops Team");
    expect(
      getComposioAccountLabel({
        id: "account-1",
        toolkitSlug: "slack",
        alias: "\u0001",
      }),
    ).toBe("slack connection \u00b7count1");
  });

  it("rejects read actions, unknown write classification, stale versions, stale schemas, and invalid arguments", async () => {
    const { handler } = setup();
    mocks.getAction.mockResolvedValue({
      slug: "SLACK_LIST_MESSAGES",
      version: effect.actionVersion,
      inputParameters: schema,
    });
    expect((await handler(makeRequest())).status).toBe(409);
    mocks.getAction.mockResolvedValue({
      slug: "SLACK_DO_SOMETHING",
      version: effect.actionVersion,
      inputParameters: schema,
    });
    expect((await handler(makeRequest())).status).toBe(409);
    mocks.getAction.mockResolvedValue({
      slug: effect.actionSlug,
      version: "new-version",
      inputParameters: schema,
    });
    expect((await handler(makeRequest())).status).toBe(409);
    mocks.getAction.mockResolvedValue({
      slug: effect.actionSlug,
      version: effect.actionVersion,
      inputParameters: {
        ...schema,
        properties: {
          ...schema.properties,
          text: { type: "string", maxLength: 10 },
        },
      },
    });
    expect((await handler(makeRequest())).status).toBe(409);
    mocks.getAction.mockResolvedValue({
      slug: effect.actionSlug,
      version: effect.actionVersion,
      inputParameters: schema,
    });
    expect(
      (
        await handler(
          makeRequest({
            accountRef: createComposioAccountReference({
              userId: "user-1",
              connectedAccountId: "conn-1",
              toolkitSlug: "slack",
              accountLabel: "Ops Workspace",
            }),
            ...effect,
            arguments: { channel_id: 42, text: "bad type" },
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects credential-bearing action schemas without minting an approval", async () => {
    const { handler } = setup();
    mocks.getAction.mockResolvedValue({
      slug: effect.actionSlug,
      version: effect.actionVersion,
      inputParameters: {
        ...schema,
        properties: { ...schema.properties, access_token: { type: "string" } },
      },
    });
    expect((await handler(makeRequest())).status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
