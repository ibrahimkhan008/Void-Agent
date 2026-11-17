import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  session: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/pg/repositories/canvas-comment-repository.pg", () => ({
  deleteCanvasElementComment: mocks.remove,
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: () => true }));

import { DELETE } from "./route";

const canvasId = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const commentId = "d2c9e15a-a2d5-4e68-9d2a-16bc1532ff56";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-a" } });
  mocks.remove.mockResolvedValue(true);
});

describe("DELETE /api/ecanvas/[canvasId]/comments/[commentId]", () => {
  it("deletes only within the current user's canvas scope", async () => {
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/ecanvas/${canvasId}/comments/${commentId}`,
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ canvasId, commentId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({
      userId: "user-a",
      canvasId,
      commentId,
    });
  });

  it("returns not found for another user's comment", async () => {
    mocks.remove.mockResolvedValueOnce(false);
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/ecanvas/${canvasId}/comments/${commentId}`,
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ canvasId, commentId }) },
    );
    expect(response.status).toBe(404);
  });
});
