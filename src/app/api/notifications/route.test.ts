import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  list: vi.fn(),
  unreadCount: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  notificationRepository: {
    list: mocks.list,
    unreadCount: mocks.unreadCount,
  },
}));

import { GET } from "./route";

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.list.mockResolvedValue([
      {
        id: "notification-1",
        type: "cockpit_update.warn",
        href: "//attacker.example",
        title: "Update",
        body: "Details",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        readAt: null,
      },
    ]);
    mocks.unreadCount.mockResolvedValue(2);
  });

  it("lists and counts only requested types with a bounded limit", async () => {
    const response = await GET(
      new Request(
        "https://app.example/api/notifications?type=cockpit_update,cockpit_update.warn&limit=900",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("owner-1", 100, [
      "cockpit_update",
      "cockpit_update.warn",
    ]);
    expect(mocks.unreadCount).toHaveBeenCalledWith("owner-1", [
      "cockpit_update",
      "cockpit_update.warn",
    ]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).notifications[0].href).toBeNull();
  });

  it("rejects malformed type filters before querying", async () => {
    const response = await GET(
      new Request("https://app.example/api/notifications?type=DROP%20TABLE"),
    );
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns no-store errors when the notification store fails", async () => {
    mocks.list.mockRejectedValueOnce(new Error("database detail"));
    const response = await GET(
      new Request("https://app.example/api/notifications"),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("database detail");
  });
});
