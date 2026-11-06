import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listJobsMock, createJobMock, createForUserMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    listJobsMock: vi.fn(),
    createJobMock: vi.fn(),
    createForUserMock: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  schedulerRepository: {
    listScheduledJobs: listJobsMock,
    createScheduledJob: createJobMock,
  },
}));
vi.mock("lib/scheduler/jobs", () => ({
  createScheduledJobForUser: createForUserMock,
  publicScheduledJob: (job: unknown) => job,
}));

import { POST } from "./route";

describe("POST scheduler jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    createForUserMock.mockResolvedValue({ id: "job-1", name: "Reminder" });
  });

  const makeRequest = (origin?: string) =>
    new Request("https://void.test/api/scheduler/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({
        scheduleType: "recurring",
        prompt: "Summarize updates",
        cron: "0 9 * * 1-5",
      }),
    });

  it("rejects missing and cross-origin mutation requests", async () => {
    expect((await POST(makeRequest())).status).toBe(403);
    expect((await POST(makeRequest("https://attacker.test"))).status).toBe(403);
    expect(createForUserMock).not.toHaveBeenCalled();
  });

  it("creates an owner-bound schedule for a same-origin request", async () => {
    const response = await POST(makeRequest("https://void.test"));
    expect(response.status).toBe(200);
    expect(createForUserMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ prompt: "Summarize updates" }),
    );
  });
});
