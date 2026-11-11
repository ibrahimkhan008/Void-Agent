import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getByIdForUser: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request?: Request, context?: unknown) =>
      handler(
        request ??
          new NextRequest(
            "https://app.test/api/bug-bounty/reports/00000000-0000-4000-8000-0000000000aa/comments",
          ),
        { user: { id: "user-1" } },
        context ?? {
          params: Promise.resolve({
            id: "00000000-0000-4000-8000-0000000000aa",
          }),
        },
      ),
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/db/repository", () => ({
  bugReportRepository: {
    getByIdForUser: mocks.getByIdForUser,
    listComments: mocks.listComments,
    addComment: mocks.addComment,
  },
}));

import { GET, POST } from "./route";

const REPORT_ID = "00000000-0000-4000-8000-0000000000aa";
const context = { params: Promise.resolve({ id: REPORT_ID }) };

const request = (method: string, body?: string, origin = "https://app.test") =>
  new NextRequest(
    `https://app.test/api/bug-bounty/reports/${REPORT_ID}/comments`,
    {
      method,
      headers: {
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
    },
  );

describe("/api/bug-bounty/reports/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getByIdForUser.mockResolvedValue({
      id: REPORT_ID,
      userId: "user-1",
      status: "triaging",
    });
    mocks.listComments.mockResolvedValue([
      {
        id: "c1",
        reportId: REPORT_ID,
        userId: "user-1",
        body: "Cannot reproduce on Safari.",
        isInternal: false,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    mocks.addComment.mockResolvedValue({
      id: "c2",
      reportId: REPORT_ID,
      userId: "user-1",
      body: "Repro attached.",
      isInternal: false,
      createdAt: new Date(),
    });
  });

  it("lists comments only for the owner's report", async () => {
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    expect(mocks.getByIdForUser).toHaveBeenCalledWith(REPORT_ID, "user-1");
    // Reporters must never see internal triage notes.
    expect(mocks.listComments).toHaveBeenCalledWith(REPORT_ID, {
      includeInternal: false,
    });
    expect((await response.json()).comments).toHaveLength(1);
  });

  it("returns 404 when the report is not owned by the caller", async () => {
    mocks.getByIdForUser.mockResolvedValue(null);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(404);
    expect(mocks.listComments).not.toHaveBeenCalled();
  });

  it("posts a comment as the signed-in reporter with isInternal off", async () => {
    const response = await POST(
      request("POST", JSON.stringify({ body: "  Repro attached.  " })),
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.addComment).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      userId: "user-1",
      body: "Repro attached.",
      isInternal: false,
    });
    expect((await response.json()).comment.id).toBe("c2");
  });

  it("rejects cross-origin comments", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await POST(
      request("POST", JSON.stringify({ body: "hi" }), "https://evil.test"),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.addComment).not.toHaveBeenCalled();
  });

  it("rejects comments for reports the caller does not own", async () => {
    mocks.getByIdForUser.mockResolvedValue(null);
    const response = await POST(
      request("POST", JSON.stringify({ body: "hi" })),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.addComment).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace-only comment bodies", async () => {
    expect(
      (await POST(request("POST", JSON.stringify({ body: "" })), context))
        .status,
    ).toBe(400);
    expect(
      (await POST(request("POST", JSON.stringify({ body: "   " })), context))
        .status,
    ).toBe(400);
    expect(mocks.addComment).not.toHaveBeenCalled();
  });

  it("enforces the 10,000-character comment upper bound", async () => {
    const response = await POST(
      request("POST", JSON.stringify({ body: "x".repeat(10_001) })),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.addComment).not.toHaveBeenCalled();
  });

  it("accepts a comment of exactly 10,000 characters", async () => {
    const response = await POST(
      request("POST", JSON.stringify({ body: "x".repeat(10_000) })),
      context,
    );
    expect(response.status).toBe(201);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("POST", "not-json"), context);
    expect(response.status).toBe(400);
    expect(mocks.addComment).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the repository fails", async () => {
    mocks.addComment.mockRejectedValue(new Error("pool exhausted"));
    const response = await POST(
      request("POST", JSON.stringify({ body: "hi" })),
      context,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
  });
});
