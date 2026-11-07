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

import { notifyProjectHealthTransition } from "./project-health";

describe("notifyProjectHealthTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recipients.mockResolvedValue(["owner-1", "member-1"]);
    mocks.createIfNew.mockResolvedValue({ id: "notification-1" });
    mocks.sendPushToUser.mockResolvedValue({ sent: 1 });
  });

  it("sends a generic deduplicated digest only on known health transitions", async () => {
    const result = await notifyProjectHealthTransition({
      projectId: "project-1",
      inputFingerprint: "fingerprint-1",
      previousHealth: "yellow",
      health: "red",
    });

    expect(result).toEqual({ inserted: 2 });
    expect(mocks.recipients).toHaveBeenCalledWith("project-1");
    expect(mocks.createIfNew).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        type: "project_health_changed",
        title: "Project status changed",
        body: "Project health moved from yellow to red. Open the project to review its latest status.",
        href: "/projects/project-1",
        dedupeKey: expect.stringMatching(/^project-health:project-1:/),
      }),
    );
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.createIfNew.mock.calls)).not.toContain(
      "private blocker text",
    );
  });

  it("skips first, unchanged, and unknown statuses", async () => {
    await expect(
      notifyProjectHealthTransition({
        projectId: "project-1",
        inputFingerprint: "same",
        previousHealth: null,
        health: "yellow",
      }),
    ).resolves.toEqual({ inserted: 0 });
    await expect(
      notifyProjectHealthTransition({
        projectId: "project-1",
        inputFingerprint: "same",
        previousHealth: "green",
        health: "green",
      }),
    ).resolves.toEqual({ inserted: 0 });
    await expect(
      notifyProjectHealthTransition({
        projectId: "project-1",
        inputFingerprint: "same",
        previousHealth: "red",
        health: "unknown",
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.recipients).not.toHaveBeenCalled();
    expect(mocks.createIfNew).not.toHaveBeenCalled();
  });

  it("does not push when recipient notification was already present", async () => {
    mocks.createIfNew.mockResolvedValue(null);
    await expect(
      notifyProjectHealthTransition({
        projectId: "project-1",
        inputFingerprint: "fingerprint-1",
        previousHealth: "yellow",
        health: "red",
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("keeps a persisted status update successful when notification delivery fails", async () => {
    mocks.recipients.mockRejectedValue(new Error("database unavailable"));
    await expect(
      notifyProjectHealthTransition({
        projectId: "project-1",
        inputFingerprint: "fingerprint-1",
        previousHealth: "yellow",
        health: "red",
      }),
    ).resolves.toEqual({ inserted: 0 });
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});
