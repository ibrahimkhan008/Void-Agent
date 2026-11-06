import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), warn: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({ notificationRepository: { create: mocks.create } }));
vi.mock("./web-push", () => ({ sendPushToUser: mocks.send }));
vi.mock("logger", () => ({ default: { warn: mocks.warn } }));

import { notifyScheduledRun } from "./scheduled-run";

describe("scheduled run notifications", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ id: "notification-1" }); });
  it("deduplicates each terminal scheduler run and attempts push", async () => {
    await notifyScheduledRun({ userId: "user-1", runId: "run-1", jobName: "Daily check", threadId: "thread-1", failed: false });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: "scheduled-run:run-1", type: "scheduled_run_completed", userId: "user-1" }));
    expect(mocks.send).toHaveBeenCalledWith("user-1", expect.objectContaining({ href: "/chat/thread-1" }));
  });
  it("does not send a second push when notification already exists", async () => {
    mocks.create.mockResolvedValue(null);
    await notifyScheduledRun({ userId: "user-1", runId: "run-1", jobName: "Daily check", threadId: "thread-1", failed: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not throw if database or push delivery fails", async () => {
    mocks.create.mockRejectedValue(new Error("unavailable"));
    await expect(notifyScheduledRun({ userId: "user-1", runId: "run-1", jobName: "Daily check", threadId: "thread-1", failed: true })).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});
