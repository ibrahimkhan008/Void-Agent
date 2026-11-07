import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createIfNew: vi.fn(),
  recipients: vi.fn(),
  sendPush: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  notificationRepository: { createIfNew: mocks.createIfNew },
}));
vi.mock("lib/projects/recipients", () => ({
  listProjectNotificationRecipientIds: mocks.recipients,
}));
vi.mock("./web-push", () => ({ sendPushToUser: mocks.sendPush }));
vi.mock("logger", () => ({ default: { warn: mocks.warn } }));

import { notifyProjectBrainRunCompleted } from "./project-brain-run-completed";

describe("notifyProjectBrainRunCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recipients.mockResolvedValue(["owner-1", "member-1", "member-1"]);
    mocks.createIfNew.mockResolvedValue({ id: "notification-1" });
    mocks.sendPush.mockResolvedValue({ sent: 1 });
  });

  it("notifies only current recipients once per run without exposing source text", async () => {
    const result = await notifyProjectBrainRunCompleted({
      projectId: "project-1",
      runId: "run-1",
      factCount: 3,
      todoCount: 2,
    });

    expect(result).toEqual({ inserted: 2 });
    expect(mocks.recipients).toHaveBeenCalledWith("project-1");
    expect(mocks.createIfNew).toHaveBeenCalledTimes(2);
    expect(mocks.createIfNew).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        type: "project_brain_run_completed",
        dedupeKey: "project-brain-run:run-1",
        href: "/projects/project-1",
      }),
    );
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.createIfNew.mock.calls)).not.toContain(
      "private source text",
    );
  });

  it("does not push duplicate notifications or create empty digests", async () => {
    mocks.createIfNew.mockResolvedValue(null);
    await expect(
      notifyProjectBrainRunCompleted({
        projectId: "project-1",
        runId: "run-1",
        factCount: 1,
        todoCount: 0,
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();

    await expect(
      notifyProjectBrainRunCompleted({
        projectId: "project-1",
        runId: "run-2",
        factCount: 0,
        todoCount: 0,
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.recipients).toHaveBeenCalledTimes(1);
  });

  it("does not fail a completed run when push delivery fails", async () => {
    mocks.sendPush.mockRejectedValue(new Error("push unavailable"));
    await expect(
      notifyProjectBrainRunCompleted({
        projectId: "project-1",
        runId: "run-1",
        factCount: 1,
        todoCount: 1,
      }),
    ).resolves.toEqual({ inserted: 2 });
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });

  it("keeps extraction successful when recipient lookup or persistence fails", async () => {
    mocks.recipients.mockRejectedValueOnce(
      new Error("recipient lookup failed"),
    );
    await expect(
      notifyProjectBrainRunCompleted({
        projectId: "project-1",
        runId: "run-1",
        factCount: 1,
        todoCount: 0,
      }),
    ).resolves.toEqual({ inserted: 0 });

    mocks.recipients.mockResolvedValue(["owner-1"]);
    mocks.createIfNew.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      notifyProjectBrainRunCompleted({
        projectId: "project-1",
        runId: "run-2",
        factCount: 1,
        todoCount: 0,
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });
});
