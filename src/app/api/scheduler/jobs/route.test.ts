import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  listJobsMock,
  createJobMock,
  createForUserMock,
  selectAgentMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listJobsMock: vi.fn(),
  createJobMock: vi.fn(),
  createForUserMock: vi.fn(),
  selectAgentMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  agentRepository: { selectAgentById: selectAgentMock },
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
    selectAgentMock.mockResolvedValue({ id: "agent-1", userId: "user-1" });
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
      expect.any(Date),
      undefined,
    );
  });

  it("requires ownership when a scheduled run targets an agent and forwards its idempotency key", async () => {
    const request = new Request("https://void.test/api/scheduler/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://void.test",
        "Idempotency-Key": "call_agent_schedule_1",
      },
      body: JSON.stringify({
        scheduleType: "recurring",
        prompt: "Run the daily review",
        cron: "0 9 * * 1-5",
        timezone: "UTC",
        agentId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(selectAgentMock).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "user-1",
    );
    expect(createForUserMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        agentId: "00000000-0000-4000-8000-000000000001",
      }),
      expect.any(Date),
      "call_agent_schedule_1",
    );
  });

  it("rejects scheduling a public agent that the caller does not own", async () => {
    selectAgentMock.mockResolvedValue({
      id: "agent-1",
      userId: "someone-else",
    });
    const request = new Request("https://void.test/api/scheduler/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://void.test",
      },
      body: JSON.stringify({
        scheduleType: "recurring",
        prompt: "Run the daily review",
        cron: "0 9 * * 1-5",
        agentId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    expect((await POST(request)).status).toBe(404);
    expect(createForUserMock).not.toHaveBeenCalled();
  });
});
