import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAccess = vi.fn();
const createInboundEndpoint = vi.fn();
const listInboundEndpoints = vi.fn();
const updateInboundEndpoint = vi.fn();
const updateEndpointHookConfig = vi.fn();

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => Promise<Response>) =>
    (request: Request, context?: unknown) =>
      handler(request, { user: { id: "owner" } }, context),
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    checkAccess: (...args: unknown[]) => checkAccess(...args),
  },
  inboundRepository: {
    createInboundEndpoint: (...args: unknown[]) =>
      createInboundEndpoint(...args),
    listInboundEndpoints: (...args: unknown[]) => listInboundEndpoints(...args),
    updateInboundEndpoint: (...args: unknown[]) =>
      updateInboundEndpoint(...args),
  },
}));
vi.mock("@/lib/db/pg/repositories/hook-repository.pg", () => ({
  listHookRuns: vi.fn(),
  publicHookConfig: (raw: Record<string, unknown>) => raw,
  parseHookConfig: (raw: Record<string, unknown>) => ({
    matchRules: raw.matchRules ?? [],
    chainOnSuccess: raw.chainOnSuccess ?? [],
    script: raw.script,
  }),
  updateEndpointHookConfig: (...args: unknown[]) =>
    updateEndpointHookConfig(...args),
}));

import { PATCH } from "./[id]/route";
import { POST } from "./route";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  checkAccess.mockResolvedValue(false);
});

describe("hook agent ownership", () => {
  it("configures the endpoint before enabling it", async () => {
    checkAccess.mockResolvedValue(true);
    createInboundEndpoint.mockResolvedValue({
      id: "hook-1",
      token: "token",
      kind: "webhook",
      agentId: AGENT_ID,
    });
    const response = await POST(
      new NextRequest("http://localhost/api/hooks", {
        method: "POST",
        body: JSON.stringify({ kind: "webhook", agentId: AGENT_ID }),
      }),
    );
    expect(response.status).toBe(201);
    expect(createInboundEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      "owner",
    );
    expect(updateEndpointHookConfig.mock.invocationCallOrder[0]).toBeLessThan(
      updateInboundEndpoint.mock.invocationCallOrder[0],
    );
    expect(updateInboundEndpoint).toHaveBeenCalledWith("hook-1", "owner", {
      enabled: true,
    });
  });

  it("persists a bounded JavaScript hook script in the owner config", async () => {
    checkAccess.mockResolvedValue(true);
    createInboundEndpoint.mockResolvedValue({
      id: "hook-script",
      token: "token",
      kind: "webhook",
      agentId: AGENT_ID,
    });
    const script = { language: "typescript", source: "console.log(payload)" };
    const response = await POST(
      new NextRequest("http://localhost/api/hooks", {
        method: "POST",
        body: JSON.stringify({ kind: "webhook", agentId: AGENT_ID, script }),
      }),
    );
    expect(response.status).toBe(201);
    expect(updateEndpointHookConfig).toHaveBeenCalledWith(
      "hook-script",
      "owner",
      expect.objectContaining({ script }),
    );
  });

  it("updates an existing script without dropping it on later config edits", async () => {
    const script = { language: "python", source: "print(payload)" };
    listInboundEndpoints.mockResolvedValue([
      { id: "hook-1", userId: "owner", hookConfig: { script } },
    ]);
    const response = await PATCH(
      new NextRequest("http://localhost/api/hooks/hook-1", {
        method: "PATCH",
        body: JSON.stringify({ promptTemplate: "Handle event" }),
      }),
      { params: Promise.resolve({ id: "hook-1" }) },
    );
    expect(response.status).toBe(200);
    expect(updateEndpointHookConfig).toHaveBeenCalledWith(
      "hook-1",
      "owner",
      expect.objectContaining({ script }),
    );
  });

  it("rejects scripts over the API source limit", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/hooks", {
        method: "POST",
        body: JSON.stringify({
          kind: "webhook",
          agentId: AGENT_ID,
          script: { language: "python", source: "x".repeat(16_001) },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(createInboundEndpoint).not.toHaveBeenCalled();
  });

  it("refuses to create a hook for another user's agent", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/hooks", {
        method: "POST",
        body: JSON.stringify({ kind: "webhook", agentId: AGENT_ID }),
      }),
    );
    expect(response.status).toBe(404);
    expect(createInboundEndpoint).not.toHaveBeenCalled();
    expect(checkAccess).toHaveBeenCalledWith(AGENT_ID, "owner", true);
  });

  it("refuses to rebind a hook to another user's agent", async () => {
    listInboundEndpoints.mockResolvedValue([
      { id: "hook-1", userId: "owner", hookConfig: {} },
    ]);
    const response = await PATCH(
      new NextRequest("http://localhost/api/hooks/hook-1", {
        method: "PATCH",
        body: JSON.stringify({ agentId: AGENT_ID }),
      }),
      { params: Promise.resolve({ id: "hook-1" }) },
    );
    expect(response.status).toBe(404);
    expect(updateInboundEndpoint).not.toHaveBeenCalled();
  });

  it("preserves existing match rules during an unrelated config edit", async () => {
    const matchRules = [{ field: "subject", op: "contains", value: "invoice" }];
    listInboundEndpoints.mockResolvedValue([
      {
        id: "hook-1",
        userId: "owner",
        hookConfig: {
          matchRules,
          githubSigningSecretEncrypted: "encrypted-value",
        },
      },
    ]);
    const response = await PATCH(
      new NextRequest("http://localhost/api/hooks/hook-1", {
        method: "PATCH",
        body: JSON.stringify({ promptTemplate: "Handle this" }),
      }),
      { params: Promise.resolve({ id: "hook-1" }) },
    );
    expect(response.status).toBe(200);
    expect(updateEndpointHookConfig).toHaveBeenCalledWith(
      "hook-1",
      "owner",
      expect.objectContaining({
        matchRules,
        githubSigningSecretEncrypted: "encrypted-value",
      }),
    );
  });

  it("saves new rules before enabling an existing hook", async () => {
    listInboundEndpoints.mockResolvedValue([
      { id: "hook-1", userId: "owner", enabled: false, hookConfig: {} },
    ]);
    const response = await PATCH(
      new NextRequest("http://localhost/api/hooks/hook-1", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          matchRules: [{ field: "source", op: "equals", value: "github" }],
        }),
      }),
      { params: Promise.resolve({ id: "hook-1" }) },
    );
    expect(response.status).toBe(200);
    expect(updateEndpointHookConfig.mock.invocationCallOrder[0]).toBeLessThan(
      updateInboundEndpoint.mock.invocationCallOrder[0],
    );
  });

  it("only allows chaining to another enabled owned hook", async () => {
    const targetId = "00000000-0000-4000-8000-000000000002";
    listInboundEndpoints.mockResolvedValue([
      { id: "hook-1", userId: "owner", enabled: true, hookConfig: {} },
      {
        id: targetId,
        userId: "owner",
        agentId: AGENT_ID,
        enabled: true,
        hookConfig: {},
      },
    ]);
    checkAccess.mockResolvedValue(true);

    const response = await PATCH(
      new NextRequest("http://localhost/api/hooks/hook-1", {
        method: "PATCH",
        body: JSON.stringify({ chainOnSuccess: [targetId] }),
      }),
      { params: Promise.resolve({ id: "hook-1" }) },
    );

    expect(response.status).toBe(200);
    expect(checkAccess).toHaveBeenCalledWith(AGENT_ID, "owner", true);
    expect(updateEndpointHookConfig).toHaveBeenCalledWith(
      "hook-1",
      "owner",
      expect.objectContaining({ chainOnSuccess: [targetId] }),
    );
  });

  it("rejects self-chains and chains to hooks outside the owner list", async () => {
    const targetId = "00000000-0000-4000-8000-000000000002";
    const sourceId = "00000000-0000-4000-8000-000000000003";
    listInboundEndpoints.mockResolvedValue([
      { id: sourceId, userId: "owner", enabled: true, hookConfig: {} },
    ]);
    const selfResponse = await PATCH(
      new NextRequest(`http://localhost/api/hooks/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({ chainOnSuccess: [sourceId] }),
      }),
      { params: Promise.resolve({ id: sourceId }) },
    );
    expect(selfResponse.status).toBe(400);

    listInboundEndpoints.mockResolvedValue([
      { id: sourceId, userId: "owner", enabled: true, hookConfig: {} },
    ]);
    const foreignResponse = await PATCH(
      new NextRequest(`http://localhost/api/hooks/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({ chainOnSuccess: [targetId] }),
      }),
      { params: Promise.resolve({ id: sourceId }) },
    );
    expect(foreignResponse.status).toBe(400);
    expect(updateEndpointHookConfig).not.toHaveBeenCalled();
  });
});
