import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listJobsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listJobsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  schedulerRepository: { listScheduledJobs: listJobsMock },
}));
vi.mock("lib/const", () => ({ getBaseUrl: () => "https://void.test" }));

import { GET } from "./route";

describe("GET scheduler diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    listJobsMock.mockResolvedValue([]);
    delete process.env.CRON_SECRET;
    delete process.env.SCHEDULER_INTERNAL_SECRET;
  });

  it("requires authentication before reading schedules", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listJobsMock).not.toHaveBeenCalled();
  });

  it("returns owner-scoped due state and only secret-presence booleans", async () => {
    process.env.CRON_SECRET = "do-not-return-this";
    listJobsMock.mockResolvedValue([
      {
        id: "due",
        name: "Due",
        status: "active",
        nextRunAt: new Date(Date.now() - 60_000),
      },
      {
        id: "paused",
        name: "Paused",
        status: "paused",
        nextRunAt: new Date(Date.now() - 60_000),
      },
    ]);
    const response = await GET();
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(listJobsMock).toHaveBeenCalledWith("user-1");
    expect(body.environment).toEqual({
      cronSecret: true,
      internalSecret: true,
      baseUrl: true,
    });
    expect(body.jobs.map((job: { dueNow: boolean }) => job.dueNow)).toEqual([
      true,
      false,
    ]);
    expect(JSON.stringify(body)).not.toContain("do-not-return-this");
  });
});
