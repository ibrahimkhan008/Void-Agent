import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(() => true),
  queue: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  ManualTaskRunConflictError: class ManualTaskRunConflictError extends Error {},
  ManualTaskRunIdempotencyConflictError: class ManualTaskRunIdempotencyConflictError extends Error {},
  ManualTaskRunReplayUnavailableError: class ManualTaskRunReplayUnavailableError extends Error {},
  ManualTaskRunUnavailableError: class ManualTaskRunUnavailableError extends Error {},
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: Request, ...args: any[]) =>
      handler(request, { user: { id: "user-1" } }, ...args),
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/scheduled-tasks/runner", () => ({
  runScheduledTaskNow: mocks.run,
}));
vi.mock("@/lib/scheduled-tasks/manual-run-requests", () => ({
  MANUAL_RUN_IDEMPOTENCY_KEY_PATTERN: /^[A-Za-z0-9._:-]{1,200}$/,
  ManualTaskRunConflictError: mocks.ManualTaskRunConflictError,
  ManualTaskRunIdempotencyConflictError:
    mocks.ManualTaskRunIdempotencyConflictError,
  ManualTaskRunReplayUnavailableError:
    mocks.ManualTaskRunReplayUnavailableError,
  ManualTaskRunUnavailableError: mocks.ManualTaskRunUnavailableError,
  claimManualTaskRun: mocks.claim,
  completeManualTaskRun: mocks.complete,
  failManualTaskRun: mocks.fail,
  getManualTaskRunRequest: mocks.get,
  queueManualTaskRun: mocks.queue,
}));

import { POST } from "./route";

function request(idempotencyKey?: string) {
  return new Request("https://void.example/api/scheduled-tasks/task-1/run", {
    method: "POST",
    headers: {
      origin: "https://void.example",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

const context = { params: Promise.resolve({ id: "task-1" }) };

describe("POST scheduled task manual run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameOrigin.mockReturnValue(true);
    mocks.queue.mockResolvedValue({
      id: "request-1",
      status: "pending",
      outcome: null,
      error: null,
    });
    mocks.claim.mockResolvedValue(true);
    mocks.complete.mockResolvedValue(undefined);
    mocks.fail.mockResolvedValue(undefined);
    mocks.run.mockResolvedValue({ success: true, threadId: "thread-1" });
  });

  it("requires a same-origin request and idempotency key before queueing", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    const forbidden = await POST(request("key-1") as never, context);
    expect(forbidden.status).toBe(403);

    mocks.sameOrigin.mockReturnValue(true);
    const missingKey = await POST(request() as never, context);
    expect(missingKey.status).toBe(400);

    const malformedKey = await POST(request("bad key") as never, context);
    expect(malformedKey.status).toBe(400);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("queues under the authenticated owner, claims once, and stores the result", async () => {
    const response = await POST(request("run-key-1") as never, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      threadId: "thread-1",
    });
    expect(mocks.queue).toHaveBeenCalledWith("task-1", "user-1", "run-key-1");
    expect(mocks.claim).toHaveBeenCalledWith("request-1", expect.any(String));
    expect(mocks.run).toHaveBeenCalledWith("task-1");
    expect(mocks.complete).toHaveBeenCalledWith(
      "request-1",
      expect.any(String),
      { success: true, threadId: "thread-1" },
    );
  });

  it("replays a completed result without executing the task again", async () => {
    mocks.queue.mockResolvedValue({
      id: "request-1",
      status: "completed",
      outcome: { success: true, threadId: "thread-1" },
      error: null,
    });

    const response = await POST(request("run-key-1") as never, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      threadId: "thread-1",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("returns accepted when another live lease owns the execution", async () => {
    mocks.claim.mockResolvedValue(false);
    mocks.get.mockResolvedValue({
      id: "request-1",
      status: "processing",
      outcome: null,
      error: null,
    });

    const response = await POST(request("run-key-1") as never, context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      requestId: "request-1",
      status: "processing",
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("does not disclose foreign tasks and maps active/idempotency conflicts", async () => {
    mocks.queue.mockRejectedValueOnce(
      new mocks.ManualTaskRunUnavailableError(),
    );
    expect((await POST(request("run-key-1") as never, context)).status).toBe(
      404,
    );

    mocks.queue.mockRejectedValueOnce(new mocks.ManualTaskRunConflictError());
    expect((await POST(request("run-key-2") as never, context)).status).toBe(
      409,
    );

    mocks.queue.mockRejectedValueOnce(
      new mocks.ManualTaskRunIdempotencyConflictError(),
    );
    expect((await POST(request("run-key-3") as never, context)).status).toBe(
      409,
    );
  });

  it("returns a prior run failure without re-running it", async () => {
    mocks.queue.mockResolvedValue({
      id: "request-1",
      status: "failed",
      outcome: null,
      error: "lease expired",
    });
    const response = await POST(request("run-key-1") as never, context);
    expect(response.status).toBe(500);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("fences and persists an execution exception", async () => {
    mocks.run.mockRejectedValue(new Error("temporary runner failure"));

    const response = await POST(request("run-key-1") as never, context);
    expect(response.status).toBe(500);
    expect(mocks.fail).toHaveBeenCalledWith(
      "request-1",
      expect.any(String),
      "temporary runner failure",
    );
  });
});
