import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getByIdForUser: vi.fn(),
  updateByUser: vi.fn(),
  deleteByUser: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request?: Request, context?: unknown) =>
      handler(
        request ??
          new NextRequest(
            "https://app.test/api/bug-bounty/reports/00000000-0000-4000-8000-0000000000aa",
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
    updateByUser: mocks.updateByUser,
    deleteByUser: mocks.deleteByUser,
  },
}));

import { DELETE, GET, PATCH } from "./route";

const REPORT_ID = "00000000-0000-4000-8000-0000000000aa";
const context = { params: Promise.resolve({ id: REPORT_ID }) };

const request = (method: string, body?: string, origin = "https://app.test") =>
  new NextRequest(`https://app.test/api/bug-bounty/reports/${REPORT_ID}`, {
    method,
    headers: {
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });

describe("/api/bug-bounty/reports/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getByIdForUser.mockResolvedValue({
      id: REPORT_ID,
      userId: "user-1",
      status: "pending",
      title: "Streaming drops after 30s",
    });
    mocks.updateByUser.mockResolvedValue({
      id: REPORT_ID,
      userId: "user-1",
      status: "pending",
      title: "Renamed report",
    });
    mocks.deleteByUser.mockResolvedValue(true);
  });

  it("serves a report only to its owner", async () => {
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    expect(mocks.getByIdForUser).toHaveBeenCalledWith(REPORT_ID, "user-1");
  });

  it("hides reports that belong to someone else (404, not 403)", async () => {
    mocks.getByIdForUser.mockResolvedValue(null);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(404);
    expect(mocks.getByIdForUser).toHaveBeenCalledWith(REPORT_ID, "user-1");
  });

  it("patches a pending report with validated fields", async () => {
    const response = await PATCH(
      request("PATCH", JSON.stringify({ title: "  Renamed report  " })),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.updateByUser).toHaveBeenCalledWith(REPORT_ID, "user-1", {
      title: "Renamed report",
    });
  });

  it("locks patches once the report leaves `pending`", async () => {
    mocks.getByIdForUser.mockResolvedValue({
      id: REPORT_ID,
      userId: "user-1",
      status: "triaging",
    });
    const response = await PATCH(
      request("PATCH", JSON.stringify({ title: "Renamed report" })),
      context,
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Report is locked");
    expect(mocks.updateByUser).not.toHaveBeenCalled();
  });

  it("rejects cross-origin patches", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await PATCH(
      request(
        "PATCH",
        JSON.stringify({ title: "Renamed report" }),
        "https://evil.test",
      ),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.updateByUser).not.toHaveBeenCalled();
  });

  it("rejects patches for reports the caller does not own", async () => {
    mocks.getByIdForUser.mockResolvedValue(null);
    const response = await PATCH(
      request("PATCH", JSON.stringify({ title: "Renamed report" })),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.updateByUser).not.toHaveBeenCalled();
  });

  it("rejects invalid patch payloads", async () => {
    const response = await PATCH(
      request("PATCH", JSON.stringify({ title: "no" })),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.updateByUser).not.toHaveBeenCalled();
  });

  it("deletes a pending report owned by the caller", async () => {
    const response = await DELETE(request("DELETE"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.deleteByUser).toHaveBeenCalledWith(REPORT_ID, "user-1");
  });

  it("returns 404 when the delete matches no owned row", async () => {
    mocks.deleteByUser.mockResolvedValue(false);
    const response = await DELETE(request("DELETE"), context);
    expect(response.status).toBe(404);
  });

  it("rejects cross-origin deletes", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await DELETE(
      request("DELETE", undefined, "https://evil.test"),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.deleteByUser).not.toHaveBeenCalled();
  });
});
