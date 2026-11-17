import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outboxTick: vi.fn(),
  dailyDigest: vi.fn(),
}));

vi.mock("@/lib/inngest/functions/webhook-outbox", () => ({
  runWebhookOutboxTick: (...args: unknown[]) => mocks.outboxTick(...args),
}));
vi.mock("@/lib/notifications/digest-cron", () => ({
  runDailyDigest: (...args: unknown[]) => mocks.dailyDigest(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCHEDULED_TASK_SECRET = "jobs-secret";
  mocks.outboxTick.mockResolvedValue({
    claimed: 1,
    delivered: 1,
    failed: 0,
    retried: 0,
    hooksDispatched: 1,
  });
  mocks.dailyDigest.mockResolvedValue({
    skipped: false,
    recipients: 2,
    sent: 2,
    failed: 0,
  });
});

const tick = (job: string, auth = "jobs-secret") =>
  new Request(`https://void.test/api/background-jobs/${job}`, {
    method: "POST",
    headers: { "X-Scheduled-Task-Auth": auth },
  });

describe("POST /api/background-jobs/[job]", () => {
  it("returns 503 when SCHEDULED_TASK_SECRET is unset", async () => {
    delete process.env.SCHEDULED_TASK_SECRET;
    const response = await POST(tick("outbox-tick"), {
      params: Promise.resolve({ job: "outbox-tick" }),
    });
    expect(response.status).toBe(503);
  });

  it("returns 401 on a wrong secret", async () => {
    const response = await POST(tick("outbox-tick", "wrong"), {
      params: Promise.resolve({ job: "outbox-tick" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.outboxTick).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown jobs", async () => {
    const response = await POST(tick("jobs-secret"), {
      params: Promise.resolve({ job: "mystery" }),
    });
    expect(response.status).toBe(404);
  });

  it("runs the outbox tick and reports the tally", async () => {
    const response = await POST(tick("outbox-tick"), {
      params: Promise.resolve({ job: "outbox-tick" }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      job: "outbox-tick",
      claimed: 1,
      delivered: 1,
      hooksDispatched: 1,
    });
  });

  it("runs the daily digest when driven over HTTP", async () => {
    const response = await POST(tick("email-digest"), {
      params: Promise.resolve({ job: "email-digest" }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      job: "email-digest",
      skipped: false,
      recipients: 2,
      sent: 2,
    });
  });

  it("surfaces job failures as 500", async () => {
    mocks.outboxTick.mockRejectedValue(new Error("db pool exhausted"));
    const response = await POST(tick("outbox-tick"), {
      params: Promise.resolve({ job: "outbox-tick" }),
    });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("db pool exhausted");
  });
});
