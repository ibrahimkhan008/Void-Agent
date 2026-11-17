import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  session: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/pg/repositories/canvas-comment-repository.pg", () => ({
  createCanvasElementComment: mocks.create,
  listCanvasElementComments: mocks.list,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: () => true }));

import { GET, POST } from "./route";

const canvasId = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const context = { params: Promise.resolve({ canvasId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-a" } });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.list.mockResolvedValue([]);
  mocks.create.mockResolvedValue({
    id: "d2c9e15a-a2d5-4e68-9d2a-16bc1532ff56",
    elementId: "element-1",
    body: "Review this shape",
    createdAt: new Date(),
  });
});

describe("eCanvas element comments", () => {
  it("lists comments scoped to the signed-in user, canvas, and element", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/ecanvas/${canvasId}/comments?elementId=element-1`,
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      userId: "user-a",
      canvasId,
      elementId: "element-1",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects malformed element ids without querying storage", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/ecanvas/${canvasId}/comments?elementId=../user`,
      ),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("stores trimmed comments under the authenticated owner", async () => {
    const response = await POST(
      new NextRequest(`http://localhost/api/ecanvas/${canvasId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elementId: "element-1",
          body: "  Review this shape  ",
        }),
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      userId: "user-a",
      canvasId,
      elementId: "element-1",
      body: "Review this shape",
    });
  });

  it("rejects unauthenticated requests and invalid comment bodies", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const unauthenticated = await POST(
      new NextRequest(`http://localhost/api/ecanvas/${canvasId}/comments`, {
        method: "POST",
        body: JSON.stringify({ elementId: "element-1", body: "hello" }),
      }),
      context,
    );
    expect(unauthenticated.status).toBe(401);

    const invalid = await POST(
      new NextRequest(`http://localhost/api/ecanvas/${canvasId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId: "element-1", body: "   " }),
      }),
      context,
    );
    expect(invalid.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
