import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repo: {
    createMonitor: vi.fn(),
    listMonitors: vi.fn(),
    getMonitor: vi.fn(),
    updateMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    listIncidents: vi.fn(),
    getIncident: vi.fn(),
    updateIncident: vi.fn(),
  },
  selectOwnerIdBySlug: vi.fn(),
  approve: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => Promise<Response>) =>
    (request: Request, context?: unknown) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));

vi.mock("@/lib/db/pg/repositories/sentinel-repository.pg", () => ({
  sentinelRepository: mocks.repo,
  isSentinelMode: (value: unknown) =>
    ["monitor", "suggest", "repair_approval", "autonomous"].includes(
      value as string,
    ),
  isSentinelStatus: () => true,
}));

vi.mock("@/lib/db/pg/repositories/published-page-repository.pg", () => ({
  pgPublishedPageRepository: {
    selectOwnerIdBySlug: (...args: unknown[]) =>
      mocks.selectOwnerIdBySlug(...args),
  },
}));

vi.mock("@/lib/sentinel/repair", () => ({
  approveSentinelFix: (...args: unknown[]) => mocks.approve(...args),
  rollbackSentinelFix: (...args: unknown[]) => mocks.rollback(...args),
}));

import { POST as incidentAction } from "./incidents/[id]/route";
import { POST as createRoute, GET as listRoute } from "./monitors/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.listMonitors.mockResolvedValue([]);
  mocks.repo.listIncidents.mockResolvedValue([]);
  mocks.selectOwnerIdBySlug.mockResolvedValue("owner-1");
  mocks.repo.createMonitor.mockImplementation(async (_userId, input) => ({
    id: "mon-1",
    userId: "owner-1",
    enabled: true,
    lastStatus: "unknown",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input,
  }));
  mocks.approve.mockResolvedValue({ ok: true, version: 4 });
  mocks.rollback.mockResolvedValue({ ok: true, version: 5 });
});

const jsonRequest = (body: unknown) =>
  new Request("https://void.test/api/sentinel/monitors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;

describe("/api/sentinel/monitors", () => {
  it("lists monitors and incidents for the owner", async () => {
    mocks.repo.listMonitors.mockResolvedValue([{ id: "mon-1", slug: "site" }]);
    const response = await listRoute(
      new Request("https://void.test/api/x") as NextRequest,
    );
    const payload = (await response.json()) as {
      monitors: unknown[];
      incidents: unknown[];
    };
    expect(payload.monitors).toHaveLength(1);
    expect(payload.incidents).toEqual([]);
  });

  it("creates a monitor for a site the user owns", async () => {
    const response = await createRoute(
      jsonRequest({
        slug: "my-site",
        mode: "autonomous",
        assertions: [{ type: "contains", value: "Inventory OK" }],
        intervalSeconds: 120,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.repo.createMonitor).toHaveBeenCalledWith("owner-1", {
      slug: "my-site",
      mode: "autonomous",
      assertions: [{ type: "contains", value: "Inventory OK" }],
      intervalSeconds: 120,
    });
  });

  it("refuses monitoring a site the user does not own", async () => {
    mocks.selectOwnerIdBySlug.mockResolvedValue("someone-else");
    const response = await createRoute(
      jsonRequest({ slug: "their-site", mode: "monitor" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.repo.createMonitor).not.toHaveBeenCalled();
  });

  it("validates the mode", async () => {
    const response = await createRoute(
      jsonRequest({ slug: "my-site", mode: "aggressive" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("/api/sentinel/incidents/[id]", () => {
  it("approves a proposed fix for the owner", async () => {
    const response = await incidentAction(
      new Request("https://void.test/api/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }) as NextRequest,
      { params: Promise.resolve({ id: "inc-1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, version: 4 });
    expect(mocks.approve).toHaveBeenCalledWith("owner-1", "inc-1");
  });

  it("rolls a deployed fix back", async () => {
    const response = await incidentAction(
      new Request("https://void.test/api/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rollback" }),
      }) as NextRequest,
      { params: Promise.resolve({ id: "inc-1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.rollback).toHaveBeenCalledWith("owner-1", "inc-1");
  });

  it("rejects unknown actions", async () => {
    const response = await incidentAction(
      new Request("https://void.test/api/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "detonate" }),
      }) as NextRequest,
      { params: Promise.resolve({ id: "inc-1" }) },
    );
    expect(response.status).toBe(400);
  });
});
