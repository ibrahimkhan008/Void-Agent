import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("lib/db/repository", () => ({
  schedulerRepository: {
    createScheduledJob: vi.fn(),
  },
}));

import type { ScheduledJob } from "lib/db/pg/schema.pg";
import {
  createScheduledJobForUser,
  normalizeScheduleCreateInput,
  normalizeScheduleUpdateInput,
  parseSimpleScheduleText,
} from "./jobs";

describe("parseSimpleScheduleText", () => {
  const now = new Date("2026-06-02T10:00:00.000Z");

  it("parses 'in N minutes' expressions", () => {
    const result = parseSimpleScheduleText("in 5 minutes check deploy", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 5 * 60_000).toISOString(),
    );
    expect(result.message).toBe("check deploy");
  });

  it("parses 'in N hours' expressions", () => {
    const result = parseSimpleScheduleText("in 2 hours water plants", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
    );
  });

  it("parses 'in N days' expressions", () => {
    const result = parseSimpleScheduleText("in 1 day standup", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    );
  });

  it("parses explicit ISO datetimes", () => {
    const result = parseSimpleScheduleText(
      "at 2026-07-01T09:00:00Z standup",
      now,
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });

  it("rejects unsupported phrasing", () => {
    const result = parseSimpleScheduleText("later", now);
    expect("error" in result).toBe(true);
  });
});

describe("normalizeScheduleCreateInput", () => {
  const now = new Date("2026-06-02T10:00:00.000Z");

  it("rejects one-shot schedules that are too soon", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        {
          scheduleType: "once",
          prompt: "check deploy",
          runAt: new Date(now.getTime() + 5_000).toISOString(),
        },
        now,
      ),
    ).toThrow(/at least 30 seconds/);
  });

  it("builds a valid one-shot cron and ISO runAt", () => {
    const result = normalizeScheduleCreateInput(
      {
        scheduleType: "once",
        prompt: "check deploy",
        runAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      },
      now,
    );
    expect(result.cron.split(" ").length).toBe(5);
    expect(result.payload.scheduleType).toBe("once");
    expect(result.payload.triggerMessage).toBe("check deploy");
  });

  it("uses naturalLanguage when no runAt is provided", () => {
    const result = normalizeScheduleCreateInput(
      {
        scheduleType: "once",
        prompt: "ignored when natural language is used",
        naturalLanguage: "in 5 minutes check deploy",
      },
      now,
    );
    expect(result.payload.scheduleType).toBe("once");
  });

  it("requires a cron for recurring schedules", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        { scheduleType: "recurring", prompt: "x" },
        now,
      ),
    ).toThrow(/cron/);
  });

  it("rejects an invalid cron", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        { scheduleType: "recurring", prompt: "x", cron: "not a cron" },
        now,
      ),
    ).toThrow(/Invalid cron/);
  });

  it("computes nextRunAt for a valid recurring cron", () => {
    const result = normalizeScheduleCreateInput(
      { scheduleType: "recurring", prompt: "x", cron: "0 9 * * *" },
      now,
    );
    expect(result.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result.payload.scheduleType).toBe("recurring");
  });

  it("computes recurring schedules in the selected IANA timezone", () => {
    const result = normalizeScheduleCreateInput(
      {
        scheduleType: "recurring",
        prompt: "x",
        cron: "30 9 * * *",
        timezone: "America/New_York",
      },
      new Date("2026-03-07T15:00:00.000Z"),
    );
    expect(result.timezone).toBe("America/New_York");
    expect(result.nextRunAt.toISOString()).toBe("2026-03-08T13:30:00.000Z");
  });

  it("rejects an unknown IANA timezone", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        {
          scheduleType: "recurring",
          prompt: "x",
          cron: "0 9 * * *",
          timezone: "Mars/Olympus",
        },
        now,
      ),
    ).toThrow(/valid IANA timezone/);
  });
});

describe("createScheduledJobForUser approval idempotency", () => {
  it("uses a stable hash across retries of a recurring schedule", async () => {
    const { schedulerRepository } = await import("lib/db/repository");
    vi.mocked(schedulerRepository.createScheduledJob).mockResolvedValue({
      id: "job-1",
    } as ScheduledJob);
    const raw = {
      scheduleType: "recurring",
      prompt: "Review the daily report",
      cron: "0 9 * * 1-5",
      timezone: "UTC",
      agentId: "00000000-0000-4000-8000-000000000001",
    };
    await createScheduledJobForUser(
      "user-1",
      raw,
      new Date("2026-11-01T00:00:00Z"),
      "request-1",
    );
    await createScheduledJobForUser(
      "user-1",
      raw,
      new Date("2026-11-02T00:00:00Z"),
      "request-1",
    );
    const first = vi
      .mocked(schedulerRepository.createScheduledJob)
      .mock.calls.at(-2)?.[2];
    const retry = vi
      .mocked(schedulerRepository.createScheduledJob)
      .mock.calls.at(-1)?.[2];
    expect(first?.requestKey).toBe("request-1");
    expect(first?.requestHash).toHaveLength(64);
    expect(retry).toEqual(first);
  });

  it("binds the schedule approval hash to prompt, agent, and exact run time", async () => {
    const { schedulerRepository } = await import("lib/db/repository");
    vi.mocked(schedulerRepository.createScheduledJob).mockResolvedValue({
      id: "job-1",
    } as ScheduledJob);
    const base = {
      scheduleType: "once",
      prompt: "Review report",
      runAt: "2026-11-07T10:00:00Z",
      agentId: "00000000-0000-4000-8000-000000000001",
    };
    await createScheduledJobForUser(
      "user-1",
      base,
      new Date("2026-11-07T09:00:00Z"),
      "request-2",
    );
    await createScheduledJobForUser(
      "user-1",
      { ...base, prompt: "Send report" },
      new Date("2026-11-07T09:00:00Z"),
      "request-2",
    );
    const first = vi
      .mocked(schedulerRepository.createScheduledJob)
      .mock.calls.at(-2)?.[2];
    const changed = vi
      .mocked(schedulerRepository.createScheduledJob)
      .mock.calls.at(-1)?.[2];
    expect(first?.requestHash).not.toBe(changed?.requestHash);
  });
});

describe("normalizeScheduleUpdateInput", () => {
  const now = new Date("2026-06-02T10:00:00.000Z");
  const existing = {
    id: "job-1",
    userId: "user-1",
    agentId: "123e4567-e89b-42d3-a456-426614174001",
    name: "Existing task",
    cron: "0 9 * * *",
    timezone: "UTC",
    claimToken: null,
    claimExpiresAt: null,
    payload: {
      triggerMessage: "old prompt",
      threadId: "thread-1",
      createdFrom: "chat-tool",
    },
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    nextRunAt: new Date(now.getTime() + 60_000),
    status: "active",
  } as ScheduledJob;

  it("recomputes a recurring run and retains agent/thread context", () => {
    const result = normalizeScheduleUpdateInput(
      {
        scheduleType: "recurring",
        prompt: "new prompt",
        cron: "30 11 * * 1-5",
        timezone: "Europe/London",
      },
      existing,
      now,
    );

    expect(result.cron).toBe("30 11 * * 1-5");
    expect(result.timezone).toBe("Europe/London");
    expect(result.payload).toMatchObject({
      scheduleType: "recurring",
      triggerMessage: "new prompt",
      threadId: "thread-1",
      createdFrom: "chat-tool",
      executionMode: "agent",
    });
    expect(result.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("rejects invalid cron and one-shot times inside the minimum lead window", () => {
    expect(() =>
      normalizeScheduleUpdateInput(
        {
          scheduleType: "recurring",
          prompt: "new prompt",
          cron: "broken",
          timezone: "UTC",
        },
        existing,
        now,
      ),
    ).toThrow(/Invalid cron/);
    expect(() =>
      normalizeScheduleUpdateInput(
        {
          scheduleType: "once",
          prompt: "new prompt",
          runAt: new Date(now.getTime() + 10_000).toISOString(),
        },
        existing,
        now,
      ),
    ).toThrow(/at least 30 seconds/);
  });
});
