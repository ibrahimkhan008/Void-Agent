import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createIfNew: vi.fn(),
  recipients: vi.fn(),
  sendPushToUser: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  notificationRepository: { createIfNew: mocks.createIfNew },
}));
vi.mock("lib/projects/recipients", () => ({
  listProjectNotificationRecipientIds: mocks.recipients,
}));
vi.mock("./web-push", () => ({ sendPushToUser: mocks.sendPushToUser }));
vi.mock("logger", () => ({ default: { warn: mocks.warn } }));

import { notifyAcceptedProjectBrainTodo } from "./project-brain-todo-accepted";

describe("notifyAcceptedProjectBrainTodo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recipients.mockResolvedValue(["owner-1", "member-1"]);
    mocks.createIfNew.mockResolvedValue({ id: "notification-1" });
    mocks.sendPushToUser.mockResolvedValue({ sent: 1 });
  });

  it("resolves recipients at send time and deduplicates each todo per recipient", async () => {
    await expect(
      notifyAcceptedProjectBrainTodo({
        projectId: "project-1",
        todoId: "todo-1",
      }),
    ).resolves.toEqual({ inserted: 2 });

    expect(mocks.recipients).toHaveBeenCalledWith("project-1");
    expect(mocks.createIfNew).toHaveBeenCalledTimes(2);
    expect(mocks.createIfNew).toHaveBeenCalledWith({
      userId: "owner-1",
      type: "project_brain_todo_accepted",
      title: "Project action item accepted",
      body: "A reviewed action item was accepted in this project.",
      href: "/projects/project-1",
      dedupeKey: "project-brain-todo-accepted:todo-1",
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.createIfNew.mock.calls)).not.toContain(
      "model proposal title",
    );
  });

  it("does not push when the per-recipient dedupe key already exists", async () => {
    mocks.createIfNew.mockResolvedValue(null);
    await expect(
      notifyAcceptedProjectBrainTodo({
        projectId: "project-1",
        todoId: "todo-1",
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("keeps notification or push failures from changing accepted todo state", async () => {
    mocks.createIfNew.mockRejectedValueOnce(new Error("db unavailable"));
    mocks.sendPushToUser.mockRejectedValueOnce(new Error("push unavailable"));
    await expect(
      notifyAcceptedProjectBrainTodo({
        projectId: "project-1",
        todoId: "todo-1",
      }),
    ).resolves.toEqual({ inserted: 1 });
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });
});
