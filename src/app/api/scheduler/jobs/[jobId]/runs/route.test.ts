import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getJobMock, listRunsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getJobMock: vi.fn(),
  listRunsMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  schedulerRepository: {
    getScheduledJob: getJobMock,
    listScheduledRuns: listRunsMock,
  },
}));

import { GET } from "./route";

const id = "123e4567-e89b-42d3-a456-426614174000";
const params = Promise.resolve({ jobId: id });

describe("GET scheduler job runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getJobMock.mockResolvedValue({ id, userId: "user-1" });
    listRunsMock.mockResolvedValue([{ id: "run-1", status: "completed" }]);
  });

  it("requires a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs`),
      { params },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it("checks job ownership and clamps results at the API boundary", async () => {
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs?limit=100`),
      { params },
    );
    expect(response.status).toBe(200);
    expect(getJobMock).toHaveBeenCalledWith(id, "user-1");
    expect(listRunsMock).toHaveBeenCalledWith(id, "user-1", 100);
    expect(await response.json()).toEqual({
      runs: [{ id: "run-1", status: "completed" }],
    });
  });

  it("returns lifecycle metadata without exposing run output or errors", async () => {
    const startedAt = new Date("2026-11-07T00:00:00.000Z");
    const completedAt = new Date("2026-11-07T00:00:02.000Z");
    listRunsMock.mockResolvedValue([
      {
        id: "run-private",
        startedAt,
        completedAt,
        status: "failed",
        output: { prompt: "private prompt" },
        error: "provider response with private data",
      },
    ]);

    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs`),
      { params },
    );

    expect(await response.json()).toEqual({
      runs: [
        {
          id: "run-private",
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          status: "failed",
          failureDiagnostic: {
            code: "unknown",
            message:
              "This run failed. Check the scheduler configuration and retry.",
          },
        },
      ],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("exposes only a safe failure category for known scheduler errors", async () => {
    listRunsMock.mockResolvedValue([
      {
        id: "run-private",
        startedAt: new Date("2026-11-07T00:00:00.000Z"),
        completedAt: new Date("2026-11-07T00:00:02.000Z"),
        status: "failed",
        error: "chat-api-401: response included private session content",
      },
    ]);
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs`),
      { params },
    );
    const body = await response.json();
    expect(body.runs[0].failureDiagnostic).toEqual({
      code: "authentication",
      message: "The scheduler could not authenticate this run.",
    });
    expect(JSON.stringify(body)).not.toContain("private session content");
  });

  it("does not query history for a job owned by another user", async () => {
    getJobMock.mockResolvedValue(null);
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs`),
      { params },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listRunsMock).not.toHaveBeenCalled();
  });

  it("rejects unbounded or malformed limits", async () => {
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs?limit=1000`),
      { params },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it("does not cache a failed history request", async () => {
    listRunsMock.mockRejectedValueOnce(new Error("database failure"));
    const response = await GET(
      new Request(`https://void.test/api/scheduler/jobs/${id}/runs`),
      { params },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
