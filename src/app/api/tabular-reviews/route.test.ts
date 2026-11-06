import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, selectMock, rateMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectMock: vi.fn(),
  rateMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: selectMock } }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: rateMock }));

import { GET, POST } from "./route";

describe("tabular review collection routes", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    selectMock.mockReset();
    rateMock.mockReset();
    rateMock.mockResolvedValue({ allowed: true });
  });

  it("rejects anonymous review listing without database access", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects anonymous review creation before rate limiting or storage", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await POST(new Request("http://local/api/tabular-reviews", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(rateMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("validates request bounds before querying source records", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await POST(new Request("http://local/api/tabular-reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Review", itemIds: [], columns: [] }),
    }));
    expect(response.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
