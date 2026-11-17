import { createHmac } from "node:crypto";
import { encrypt } from "lib/security/encryption";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEndpoint: vi.fn(),
  createDelivery: vi.fn(),
  enqueueOutboxEvent: vi.fn(),
  parseSlackEvent: vi.fn(),
  normalizeSlack: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  endpoint: vi.fn(),
  connectorRows: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: { provider: "provider", isConnected: "isConnected" },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: mocks.connectorRows })),
    })),
  },
}));
vi.mock("lib/db/repository", () => ({
  inboundRepository: {
    getInboundEndpointByToken: mocks.getEndpoint,
    createInboundDelivery: mocks.createDelivery,
  },
  webhookRepository: { enqueueOutboxEvent: mocks.enqueueOutboxEvent },
}));
vi.mock("lib/inbound", () => ({
  isSlackEndpointOwner: (endpointOwnerId: string, connectorOwnerId: string) =>
    endpointOwnerId.length > 0 &&
    connectorOwnerId.length > 0 &&
    endpointOwnerId === connectorOwnerId,
  normalizeEmail: vi.fn(),
  normalizeSlack: mocks.normalizeSlack,
  normalizeWebhook: vi.fn(),
  parseEmailPayload: vi.fn(),
  parseSlackEvent: mocks.parseSlackEvent,
  validateInboundRequest: vi.fn(() => ({ ok: true })),
}));
vi.mock("logger", () => ({
  default: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    withDefaults: () => ({
      info: vi.fn(),
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
    }),
  },
}));
vi.mock("../../chat/shared.chat", () => ({
  handleError: vi.fn(() => "failed"),
}));

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

const endpoint = {
  id: "endpoint-1",
  token: "endpoint-secret-token",
  userId: "owner-1",
  agentId: "agent-1",
  kind: "slack" as const,
  enabled: true,
  secretHash: null,
};
const connector = {
  id: "connector-1",
  userId: "owner-2",
  isConnected: true,
  metadata: { workspaceId: "T123", signingSecret: "slack-signing-secret" },
};

describe("POST /api/inbound/[token] Slack owner binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEndpoint.mockResolvedValue(endpoint);
    mocks.connectorRows.mockResolvedValue([connector]);
  });

  it("does not let another user's connected workspace execute this endpoint's agent", async () => {
    const request = new Request(
      "https://void.test/api/inbound/endpoint-secret-token",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "v0=signature",
          "x-slack-request-timestamp": "1700000000",
        },
        body: JSON.stringify({
          type: "event_callback",
          team_id: "T123",
          event_id: "Ev1",
          event: { type: "app_mention", text: "run", channel: "C1" },
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ token: endpoint.token }),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("No Slack connector for this workspace");
    expect(mocks.parseSlackEvent).not.toHaveBeenCalled();
    expect(mocks.normalizeSlack).not.toHaveBeenCalled();
    expect(mocks.createDelivery).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/inbound/[token] GitHub delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "12345678901234567890123456789012");
    mocks.getEndpoint.mockResolvedValue({
      ...endpoint,
      kind: "github",
      hookConfig: { githubSigningSecretEncrypted: encrypt("github-secret") },
    });
    mocks.createDelivery.mockResolvedValue({ id: "delivery-row" });
    mocks.enqueueOutboxEvent.mockImplementation(async (input) => ({
      id: input.id,
    }));
  });

  it("verifies a signed event and queues a stable delivery ID", async () => {
    const body = JSON.stringify({
      repository: { full_name: "owner/repo" },
      ref: "refs/heads/main",
      after: "abcdef",
    });
    const signature = `sha256=${createHmac("sha256", "github-secret").update(body).digest("hex")}`;
    const request = new Request("https://void.test/api/inbound/token", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "x-github-delivery": "123e4567-e89b-12d3-a456-426614174000",
        "x-github-event": "push",
      },
      body,
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(response.status).toBe(202);
    expect(mocks.createDelivery).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9-]{36}$/),
        eventType: "inbound.received",
      }),
    );
  });

  it("rejects an invalid signature without storing or queuing", async () => {
    const response = await POST(
      new Request("https://void.test/api/inbound/token", {
        method: "POST",
        headers: {
          "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
        },
        body: "{}",
      }),
      { params: Promise.resolve({ token: endpoint.token }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.createDelivery).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("rejects an oversized signed delivery before storing it", async () => {
    const response = await POST(
      new Request("https://void.test/api/inbound/token", {
        method: "POST",
        headers: { "content-length": String(3 * 1024 * 1024) },
        body: "{}",
      }),
      { params: Promise.resolve({ token: endpoint.token }) },
    );
    expect(response.status).toBe(413);
    expect(mocks.createDelivery).not.toHaveBeenCalled();
  });

  const signedRequest = (
    event: string,
    body: string,
    deliveryId = "123e4567-e89b-12d3-a456-426614174000",
  ) => {
    const signature = `sha256=${createHmac("sha256", "github-secret")
      .update(body)
      .digest("hex")}`;
    return new Request("https://void.test/api/inbound/token", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "x-github-delivery": deliveryId,
        "x-github-event": event,
      },
      body,
    });
  };

  it("acks the GitHub ping without storing or queuing anything", async () => {
    const response = await POST(signedRequest("ping", "{}"), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(response.status).toBe(200);
    expect(mocks.createDelivery).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("acks signed unsupported events as ignored without queuing", async () => {
    const body = JSON.stringify({
      action: "started",
      repository: { full_name: "owner/repo" },
    });
    const response = await POST(signedRequest("star", body), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Event ignored");
    expect(mocks.createDelivery).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed delivery and event headers", async () => {
    const body = JSON.stringify({ repository: { full_name: "owner/repo" } });
    const badDelivery = await POST(signedRequest("push", body, "bad id!"), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(badDelivery.status).toBe(400);
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();

    const badEvent = await POST(signedRequest("push;drop", body), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(badEvent.status).toBe(400);
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("queues the same stable outbox id when GitHub redelivers", async () => {
    const body = JSON.stringify({
      action: "opened",
      repository: { full_name: "owner/repo" },
      pull_request: { title: "Fix login", body: "Updates callback" },
      sender: { login: "alice" },
    });
    const first = await POST(signedRequest("pull_request", body), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    const second = await POST(signedRequest("pull_request", body), {
      params: Promise.resolve({ token: endpoint.token }),
    });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const firstCall = mocks.enqueueOutboxEvent.mock.calls[0][0] as {
      id: string;
      eventType: string;
      payload: Record<string, unknown>;
    };
    const secondCall = mocks.enqueueOutboxEvent.mock.calls[1][0] as {
      id: string;
      eventType: string;
      payload: Record<string, unknown>;
    };
    expect(secondCall.id).toBe(firstCall.id);
    expect(firstCall.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(firstCall.eventType).toBe("inbound.received");
    expect(firstCall.payload).toMatchObject({
      agentId: "agent-1",
      endpointId: "endpoint-1",
      normalized: expect.objectContaining({
        source: "github",
        from: "alice",
        meta: expect.objectContaining({ repository: "owner/repo" }),
      }),
    });
  });
});
