import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, requestManualRunMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  requestManualRunMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  schedulerRepository: { requestManualScheduledRun: requestManualRunMock },
}));

import { POST } from "./route";

const jobId = "123e4567-e89b-42d3-a456-426614174000";
const params = Promise.resolve({ jobId });
const makeRequest = (headers: Record<string, string> = {}) =>
  new Request(`https://void.test/api/scheduler/jobs/${jobId}/run`, {
    method: "POST",
    headers: { origin: "https://void.test", ...headers },
  });

describe("POST scheduler manual run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    requestManualRunMock.mockResolvedValue({
      id: "request-1",
      status: "pending",
      created: true,
    });
  });

  it("requires session, same origin, and a stable idempotency key", async () => {
    expect((await POST(makeRequest(), { params })).status).toBe(400);
    expect(
      (await POST(makeRequest({ "Idempotency-Key": "abc" }), { params }))
        .status,
    ).toBe(202);

    getSessionMock.mockResolvedValueOnce(null);
    expect(
      (await POST(makeRequest({ "Idempotency-Key": "anonymous" }), { params }))
        .status,
    ).toBe(401);
    expect(
      (
        await POST(
          new Request(`https://void.test/api/scheduler/jobs/${jobId}/run`, {
            method: "POST",
            headers: { "Idempotency-Key": "cross-origin" },
          }),
          { params },
        )
      ).status,
    ).toBe(403);
  });

  it("queues one owner-bound request and returns only lifecycle metadata", async () => {
    const response = await POST(
      makeRequest({ "Idempotency-Key": "manual-1" }),
      { params },
    );
    expect(response.status).toBe(202);
    expect(requestManualRunMock).toHaveBeenCalledWith(
      jobId,
      "user-1",
      "manual-1",
    );
    expect(await response.json()).toEqual({
      requestId: "request-1",
      status: "pending",
    });
  });

  it("returns a completed idempotent replay without queuing a second run", async () => {
    requestManualRunMock.mockResolvedValue({
      id: "request-1",
      status: "completed",
      created: false,
    });
    const response = await POST(
      makeRequest({ "Idempotency-Key": "manual-1" }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      requestId: "request-1",
      status: "completed",
    });
  });
});
