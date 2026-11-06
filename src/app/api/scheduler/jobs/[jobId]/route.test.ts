import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getJobMock,
  updateJobMock,
  deleteJobMock,
  normalizeUpdateMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getJobMock: vi.fn(),
  updateJobMock: vi.fn(),
  deleteJobMock: vi.fn(),
  normalizeUpdateMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  schedulerRepository: {
    getScheduledJob: getJobMock,
    updateScheduledJob: updateJobMock,
    deleteScheduledJob: deleteJobMock,
  },
}));
vi.mock("lib/scheduler/jobs", () => ({
  normalizeScheduleUpdateInput: normalizeUpdateMock,
  publicScheduledJob: (job: unknown) => job,
}));

import { DELETE, PATCH } from "./route";

const id = "123e4567-e89b-42d3-a456-426614174000";
const params = Promise.resolve({ jobId: id });
const existing = { id, userId: "user-1", name: "Daily summary", payload: {} };
const request = (body: unknown, origin = "https://void.test") =>
  new Request(`https://void.test/api/scheduler/jobs/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

describe("PATCH scheduler job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getJobMock.mockResolvedValue(existing);
    normalizeUpdateMock.mockReturnValue({
      cron: "30 11 * * 1-5",
      nextRunAt: new Date("2026-06-03T11:30:00Z"),
      payload: { triggerMessage: "updated" },
    });
    updateJobMock.mockImplementation(async (_id, _userId, patch) => ({
      ...existing,
      ...patch,
    }));
  });

  it("rejects a missing Origin header for mutations", async () => {
    const response = await PATCH(request({ status: "paused" }, ""), { params });
    expect(response.status).toBe(403);
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it("revalidates a schedule update and keeps writes owner-scoped", async () => {
    const response = await PATCH(
      request({
        schedule: {
          scheduleType: "recurring",
          prompt: "updated",
          cron: "30 11 * * 1-5",
          timezone: "Europe/London",
        },
      }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(getJobMock).toHaveBeenCalledWith(id, "user-1");
    expect(normalizeUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleType: "recurring" }),
      existing,
    );
    expect(updateJobMock).toHaveBeenCalledWith(
      id,
      "user-1",
      expect.objectContaining({ cron: "30 11 * * 1-5" }),
    );
  });

  it("does not update a job owned by someone else", async () => {
    getJobMock.mockResolvedValue(null);
    const response = await PATCH(request({ status: "paused" }), { params });
    expect(response.status).toBe(404);
    expect(updateJobMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Origin header before deleting", async () => {
    const response = await DELETE(
      new Request(`https://void.test/api/scheduler/jobs/${id}`, {
        method: "DELETE",
      }),
      { params },
    );
    expect(response.status).toBe(403);
    expect(deleteJobMock).not.toHaveBeenCalled();
  });
});
