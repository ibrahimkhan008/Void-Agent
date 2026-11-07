import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, selectMock, rateMock, sameOriginMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    selectMock: vi.fn(),
    rateMock: vi.fn(),
    sameOriginMock: vi.fn(),
  }),
);

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: selectMock } }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: rateMock,
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: sameOriginMock }));

import { GET, POST } from "./route";

describe("tabular review collection routes", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    selectMock.mockReset();
    rateMock.mockReset();
    sameOriginMock.mockReset();
    sameOriginMock.mockReturnValue(true);
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
    const response = await POST(
      new Request("http://local/api/tabular-reviews", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(rateMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("validates request bounds before querying source records", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await POST(
      new Request("http://local/api/tabular-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Review", itemIds: [], columns: [] }),
      }),
    );
    expect(response.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes before rate limiting or database access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    sameOriginMock.mockReturnValue(false);
    const response = await POST(
      new Request("http://local/api/tabular-reviews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ title: "Review", itemIds: [], columns: [] }),
      }),
    );
    expect(response.status).toBe(403);
    expect(rateMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON bodies before parsing or querying", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await POST(
      new Request("http://local/api/tabular-reviews", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://local" },
        body: JSON.stringify({
          title: "x".repeat(9_000),
          itemIds: [],
          columns: [],
        }),
      }),
    );
    expect(response.status).toBe(413);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
