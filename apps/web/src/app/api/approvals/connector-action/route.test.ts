import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  rateLimit: vi.fn(),
  sessionUser: "owner-1",
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: any) => (request: any) =>
    handler(request, { user: { id: mocks.sessionUser } }),
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { issue: mocks.issue },
  }),
);
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const payload = {
  provider: "gmail",
  action: "send",
  payload: {
    to: "user@example.test",
    subject: "Subject",
    message: "Reviewed body",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionUser = "owner-1";
  mocks.issue.mockResolvedValue("a".repeat(43));
  mocks.rateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/approvals/connector-action", () => {
  it("issues a token only for the authenticated user after same-origin valid payload review", async () => {
    const response = await POST(
      new Request("https://void.example/api/approvals/connector-action", {
        method: "POST",
        headers: {
          Origin: "https://void.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }) as any,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      approvalToken: "a".repeat(43),
      expiresInSeconds: 300,
    });
    expect(mocks.issue).toHaveBeenCalledWith("owner-1", payload);
    expect(mocks.rateLimit).toHaveBeenCalledWith({
      kind: "connector-action-approval",
      id: "owner-1",
      limit: 20,
      windowMs: 60_000,
    });
  });

  it("rejects cross-origin approval requests", async () => {
    const response = await POST(
      new Request("https://void.example/api/approvals/connector-action", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }) as any,
    );
    expect(response.status).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects unreviewable or oversized action payloads", async () => {
    const invalid = await POST(
      new Request("https://void.example/api/approvals/connector-action", {
        method: "POST",
        headers: {
          Origin: "https://void.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, action: "delete_everything" }),
      }) as any,
    );
    const oversized = await POST(
      new Request("https://void.example/api/approvals/connector-action", {
        method: "POST",
        headers: {
          Origin: "https://void.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          payload: { ...payload.payload, message: "x".repeat(25_000) },
        }),
      }) as any,
    );
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
