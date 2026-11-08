import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  allowed: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  sameOrigin: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.allowed,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/email/resend", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("drizzle-orm", () => ({
  desc: (column: unknown) => ({ direction: "desc", column }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.selectWhere(condition);
          return {
            orderBy: () => ({ limit: mocks.selectLimit }),
          };
        },
      }),
    }),
    insert: () => ({
      values: mocks.insertValues,
    }),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  ProblemReportTable: {
    id: "id",
    userId: "user_id",
    description: "description",
    screenshots: "screenshots",
    status: "status",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

import { GET, POST } from "./route";

const request = (body: unknown, origin = "https://app.test") =>
  new Request("https://app.test/api/problem-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("problem reports", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.allowed.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.selectLimit.mockResolvedValue([]);
    mocks.insertReturning.mockResolvedValue([
      { id: "report-1", status: "open" },
    ]);
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
  });

  it("stores a bounded report for the authenticated user and strips URL secrets", async () => {
    const response = await POST(
      request({
        description: "The upload dialog stays open after success.",
        screenshots: [],
        context: {
          pageUrl: "https://app.test/chat/thread?access_token=private#part",
          userAgent: "browser",
          locale: "en",
          viewport: "1440x900",
        },
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        description: "The upload dialog stays open after success.",
        context: expect.objectContaining({
          pageUrl: "https://app.test/chat/thread",
        }),
      }),
    );
    expect(mocks.insertValues.mock.calls[0][0].context.pageUrl).not.toContain(
      "access_token",
    );
  });

  it("notifies the configured mailbox after persistence without failing the report", async () => {
    vi.stubEnv("PROBLEM_REPORT_NOTIFY_TO", "reports@example.com");
    const response = await POST(
      request({
        description: "The export action fails.",
        screenshots: [],
        context: { pageUrl: "https://app.test/chat/thread?token=secret" },
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "reports@example.com",
        subject: expect.stringContaining("The export action fails."),
        html: expect.stringContaining("https://app.test/chat/thread"),
        from: "noreply",
      }),
    );
    expect(mocks.sendEmail.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.insertReturning.mock.invocationCallOrder[0],
    );

    mocks.sendEmail.mockRejectedValueOnce(
      new Error("mail provider unavailable"),
    );
    const stillStored = await POST(request({ description: "Another report." }));
    expect(stillStored.status).toBe(201);
  });

  it("keeps report submission available when notifications are not configured", async () => {
    vi.stubEnv("PROBLEM_REPORT_NOTIFY_TO", "");
    const response = await POST(
      request({ description: "A report without email." }),
    );
    expect(response.status).toBe(201);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, oversized, and empty reports before persistence", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    const csrf = await POST(
      request({ description: "A valid report description" }),
    );
    mocks.sameOrigin.mockReturnValue(true);
    const oversized = await POST(request({ description: "x".repeat(17_000) }));
    const empty = await POST(request({ description: "   " }));
    expect([csrf.status, oversized.status, empty.status]).toEqual([
      403, 413, 400,
    ]);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("rejects screenshots outside the authenticated user's storage prefix", async () => {
    const response = await POST(
      request({
        description: "The settings page crashes when saved.",
        screenshots: [
          {
            key: "uploads/other-user/crash.png",
            name: "crash.png",
            contentType: "image/png",
            size: 100,
          },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("accepts an uploaded screenshot only when its storage key belongs to the reporter", async () => {
    const response = await POST(
      request({
        description: "I cannot save my chat settings.",
        screenshots: [
          {
            key: "uploads/user-1/settings.png",
            name: "settings.png",
            contentType: "image/png",
            size: 100,
          },
        ],
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshots: [
          expect.objectContaining({ key: "uploads/user-1/settings.png" }),
        ],
      }),
    );
  });

  it("limits history to the signed-in user's rows", async () => {
    mocks.selectLimit.mockResolvedValue([
      {
        id: "report-1",
        description: "Issue",
        status: "open",
        createdAt: new Date("2026-11-01T00:00:00Z"),
        updatedAt: new Date("2026-11-01T00:00:00Z"),
        screenshots: [
          {
            key: "uploads/user-1/shot.png",
            name: "shot.png",
            contentType: "image/png",
            size: 10,
          },
        ],
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reports[0].screenshots[0].url).toBe(
      "/api/files/uploads/user-1/shot.png",
    );
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      column: "user_id",
      value: "user-1",
    });
  });

  it("requires authentication and applies the submission rate limit", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const unauthorized = await POST(
      request({ description: "A useful report." }),
    );
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.allowed.mockResolvedValueOnce({ allowed: false });
    const limited = await POST(request({ description: "A useful report." }));
    expect([unauthorized.status, limited.status]).toEqual([401, 429]);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
