import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createIfNew: vi.fn(),
  rateLimit: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  notificationRepository: { createIfNew: mocks.createIfNew },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/notifications/web-push", () => ({
  sendPushToUser: mocks.sendPush,
}));

import {
  createCockpitPushUpdateToolForUser,
  notificationUpdateDedupeKey,
} from "./cockpit-update";

async function execute(input: unknown) {
  const tool = createCockpitPushUpdateToolForUser("user-1", "thread/one");
  return (tool.execute as (arg: unknown) => Promise<unknown>)(input);
}

describe("user notification update tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.createIfNew.mockResolvedValue({ id: "notification-1" });
    mocks.sendPush.mockResolvedValue({ sent: 1, skipped: false });
  });

  it("writes to only the bound user's feed and sends a best-effort push", async () => {
    await expect(
      execute({
        title: "Finished review",
        body: "Three items need your attention",
        severity: "alert",
      }),
    ).resolves.toMatchObject({
      posted: true,
      id: "notification-1",
      severity: "alert",
    });
    expect(mocks.createIfNew).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "agent_update_alert",
        href: "/chat/thread%2Fone",
        title: "Finished review",
      }),
    );
    expect(mocks.sendPush).toHaveBeenCalledWith("user-1", {
      title: "Finished review",
      body: "Three items need your attention",
      href: "/chat/thread%2Fone",
    });
  });

  it("rejects external or protocol-relative destinations", async () => {
    await expect(
      execute({ title: "External", href: "https://evil.example/" }),
    ).resolves.toEqual({
      posted: false,
      error: "Invalid update.",
    });
    await expect(
      execute({ title: "External", href: "//evil.example/" }),
    ).resolves.toEqual({
      posted: false,
      error: "Invalid update.",
    });
    expect(mocks.createIfNew).not.toHaveBeenCalled();
  });

  it("does not push duplicate updates and tolerates push failure after persistence", async () => {
    mocks.createIfNew.mockResolvedValueOnce(null);
    await expect(execute({ title: "Same update" })).resolves.toEqual({
      posted: false,
      duplicate: true,
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();

    mocks.sendPush.mockRejectedValueOnce(new Error("push offline"));
    await expect(execute({ title: "Durable update" })).resolves.toMatchObject({
      posted: true,
    });
  });

  it("deduplicates matching updates within a minute, but not across minutes", () => {
    const input = { title: "Done", severity: "info" as const };
    expect(notificationUpdateDedupeKey(input, 60_001)).toBe(
      notificationUpdateDedupeKey(input, 119_999),
    );
    expect(notificationUpdateDedupeKey(input, 60_001)).not.toBe(
      notificationUpdateDedupeKey(input, 120_000),
    );
  });
});
