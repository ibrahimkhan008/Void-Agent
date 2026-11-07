import { beforeEach, describe, expect, it, vi } from "vitest";

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
    endpointOwnerId.length > 0 && connectorOwnerId.length > 0 && endpointOwnerId === connectorOwnerId,
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
    withDefaults: () => ({ info: vi.fn(), warn: mocks.loggerWarn, error: mocks.loggerError }),
  },
}));
vi.mock("../../chat/shared.chat", () => ({ handleError: vi.fn(() => "failed") }));

import { POST } from "./route";

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
    const request = new Request("https://void.test/api/inbound/endpoint-secret-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-slack-signature": "v0=signature",
        "x-slack-request-timestamp": "1700000000",
      },
      body: JSON.stringify({ type: "event_callback", team_id: "T123", event_id: "Ev1", event: { type: "app_mention", text: "run", channel: "C1" } }),
    });

    const response = await POST(request, { params: Promise.resolve({ token: endpoint.token }) });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("No Slack connector for this workspace");
    expect(mocks.parseSlackEvent).not.toHaveBeenCalled();
    expect(mocks.normalizeSlack).not.toHaveBeenCalled();
    expect(mocks.createDelivery).not.toHaveBeenCalled();
    expect(mocks.enqueueOutboxEvent).not.toHaveBeenCalled();
  });
});
