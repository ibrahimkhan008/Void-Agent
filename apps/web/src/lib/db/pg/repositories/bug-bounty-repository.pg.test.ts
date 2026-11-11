import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Repository tests are DB-free by convention: the Drizzle builder is stubbed
// so the SQL predicates (owner scoping, internal-comment filtering) can be
// asserted without a database.
const mocks = vi.hoisted(() => {
  const state = { rows: [] as any[], executeResult: null as any };

  const chain: Record<string, any> = {};
  for (const method of ["from", "where", "values", "set"]) {
    chain[method] = vi.fn(() => chain);
  }
  // Terminal methods all resolve the configurable `rows`, mirroring how each
  // query shape ends on a different builder method.
  chain.orderBy = vi.fn(async () => state.rows);
  chain.limit = vi.fn(async () => state.rows);
  chain.returning = vi.fn(async () => state.rows);

  const db = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    execute: vi.fn(async () => state.executeResult),
  };

  const drizzle = {
    eq: vi.fn((left: unknown, right: unknown) => ({ op: "eq", left, right })),
    and: vi.fn((...parts: unknown[]) => ({ op: "and", parts })),
    desc: vi.fn((column: unknown) => ({ op: "desc", column })),
    sql: vi.fn((strings: unknown, ...values: unknown[]) => ({
      strings,
      values,
    })),
  };

  return { state, chain, db, drizzle };
});

vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../db.pg", () => ({ pgDb: mocks.db }));
vi.mock("../schema.pg", () => ({
  BUG_REPORT_STATUSES: [
    "pending",
    "triaging",
    "accepted",
    "duplicate",
    "rejected",
    "awarded",
  ],
  BugReportTable: {
    id: { name: "id" },
    userId: { name: "user_id" },
    status: { name: "status" },
    severity: { name: "severity" },
    createdAt: { name: "created_at" },
  },
  BugReportCommentTable: {
    id: { name: "id" },
    reportId: { name: "report_id" },
    userId: { name: "user_id" },
    body: { name: "body" },
    isInternal: { name: "is_internal" },
    createdAt: { name: "created_at" },
  },
}));

import { BugReportTable } from "../schema.pg";
import { bugReportRepository } from "./bug-bounty-repository.pg";

const REPORT_ID = "00000000-0000-4000-8000-0000000000aa";
const OWNER = "11111111-2222-3333-4444-555555555555";
const INTRUDER = "22222222-2222-3333-4444-555555555555";

const reportRow = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  userId: OWNER,
  title: "Streaming drops after 30s",
  description: "The chat stream dies mid-answer on long responses.",
  severity: "high",
  category: "ai-output",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.rows = [];
  mocks.state.executeResult = [];
});

describe("bugReportRepository — reporter scope", () => {
  it("creates a report trimmed with the category fallback and null gaps", async () => {
    mocks.state.rows = [reportRow()];
    const created = await bugReportRepository.create(OWNER, {
      title: "  Streaming drops after 30s  ",
      description: "  The chat stream dies mid-answer on long responses.  ",
      severity: "high",
      affectedArea: "  Chat streaming  ",
      proofOfConcept: "   ",
    });

    expect(created).toEqual(mocks.state.rows[0]);
    expect(mocks.db.insert).toHaveBeenCalledWith(BugReportTable);
    expect(mocks.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        title: "Streaming drops after 30s",
        description: "The chat stream dies mid-answer on long responses.",
        severity: "high",
        category: "other",
        affectedArea: "Chat streaming",
        reproductionSteps: "",
        impact: "",
        proofOfConcept: null,
      }),
    );
  });

  it("lists only the owner's reports, newest first", async () => {
    mocks.state.rows = [reportRow()];
    const rows = await bugReportRepository.listByUser(OWNER);

    expect(rows).toHaveLength(1);
    expect(mocks.db.select).toHaveBeenCalled();
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(BugReportTable.userId, OWNER);
    expect(mocks.drizzle.desc).toHaveBeenCalledWith(BugReportTable.createdAt);
  });

  it("scopes single-report reads to (id, userId) via an AND predicate", async () => {
    mocks.state.rows = [];
    const missing = await bugReportRepository.getByIdForUser(REPORT_ID, OWNER);
    expect(missing).toBeNull();
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: BugReportTable.id, right: REPORT_ID },
      { op: "eq", left: BugReportTable.userId, right: OWNER },
    );

    // A different user asking for the same id hits the same (id, userId)
    // predicate and still sees nothing.
    mocks.state.rows = [];
    const foreign = await bugReportRepository.getByIdForUser(
      REPORT_ID,
      INTRUDER,
    );
    expect(foreign).toBeNull();
    expect(mocks.drizzle.eq).toHaveBeenLastCalledWith(
      BugReportTable.userId,
      INTRUDER,
    );
  });

  it("updates only the owner's pending report with trimmed fields", async () => {
    mocks.state.rows = [reportRow()];
    const updated = await bugReportRepository.updateByUser(REPORT_ID, OWNER, {
      title: "  Renamed title  ",
      affectedArea: "",
    });

    expect(updated).toEqual(reportRow());
    expect(mocks.db.update).toHaveBeenCalledWith(BugReportTable);
    expect(mocks.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: expect.any(Date),
        title: "Renamed title",
        affectedArea: null,
      }),
    );
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: BugReportTable.id, right: REPORT_ID },
      { op: "eq", left: BugReportTable.userId, right: OWNER },
    );
  });

  it("returns null when an owner update matches no row", async () => {
    mocks.state.rows = [];
    const updated = await bugReportRepository.updateByUser(
      REPORT_ID,
      INTRUDER,
      { title: "Hijack attempt" },
    );
    expect(updated).toBeNull();
  });

  it("reports whether an owner-scoped delete actually removed a row", async () => {
    mocks.state.rows = [{ id: REPORT_ID }];
    expect(await bugReportRepository.deleteByUser(REPORT_ID, OWNER)).toBe(true);
    expect(mocks.db.delete).toHaveBeenCalledWith(BugReportTable);
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: BugReportTable.id, right: REPORT_ID },
      { op: "eq", left: BugReportTable.userId, right: OWNER },
    );

    mocks.state.rows = [];
    expect(await bugReportRepository.deleteByUser(REPORT_ID, INTRUDER)).toBe(
      false,
    );
  });
});

describe("bugReportRepository — admin paths", () => {
  it("reads any report by id without a user predicate", async () => {
    mocks.state.rows = [reportRow()];
    const row = await bugReportRepository.getById(REPORT_ID);
    expect(row).toEqual(reportRow());
    expect(mocks.drizzle.and).not.toHaveBeenCalled();
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(BugReportTable.id, REPORT_ID);
  });

  it("lists all reports, optionally filtered by status", async () => {
    mocks.state.rows = [reportRow()];
    await bugReportRepository.listAll();
    expect(mocks.drizzle.eq).not.toHaveBeenCalled();

    await bugReportRepository.listAll("awarded");
    expect(mocks.drizzle.eq).toHaveBeenLastCalledWith(
      BugReportTable.status,
      "awarded",
    );
  });

  it("stamps resolvedAt when the status settles to a terminal value", async () => {
    mocks.state.rows = [reportRow({ status: "awarded" })];
    await bugReportRepository.updateByAdmin(REPORT_ID, {
      status: "awarded",
      awardedAmountCents: 25_000,
    });

    const set = mocks.chain.set.mock.calls[0][0];
    expect(set.status).toBe("awarded");
    expect(set.awardedAmountCents).toBe(25_000);
    expect(set.resolvedAt).toBeInstanceOf(Date);
  });

  it("does not stamp resolvedAt for non-terminal statuses", async () => {
    mocks.state.rows = [reportRow({ status: "triaging" })];
    await bugReportRepository.updateByAdmin(REPORT_ID, {
      status: "triaging",
    });

    const set = mocks.chain.set.mock.calls[0][0];
    expect(set.status).toBe("triaging");
    expect(set.resolvedAt).toBeUndefined();
  });

  it("leaves resolvedAt untouched when only the bounty changes", async () => {
    mocks.state.rows = [reportRow()];
    await bugReportRepository.updateByAdmin(REPORT_ID, {
      awardedAmountCents: 100_000,
      awardedCurrency: "USD",
    });

    const set = mocks.chain.set.mock.calls[0][0];
    expect(set.awardedAmountCents).toBe(100_000);
    expect(set.status).toBeUndefined();
    expect(set.resolvedAt).toBeUndefined();
  });
});

describe("bugReportRepository — comments", () => {
  it("hides internal notes from reporters unless includeInternal is set", async () => {
    mocks.state.rows = [
      {
        id: "c1",
        reportId: REPORT_ID,
        userId: OWNER,
        body: "Cannot reproduce on Safari.",
        isInternal: false,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ];
    const visible = await bugReportRepository.listComments(REPORT_ID);
    expect(mocks.drizzle.and).toHaveBeenCalledWith(
      { op: "eq", left: { name: "report_id" }, right: REPORT_ID },
      { op: "eq", left: { name: "is_internal" }, right: false },
    );
    expect(visible[0]).toMatchObject({
      id: "c1",
      body: "Cannot reproduce on Safari.",
      userName: undefined,
      userImage: null,
    });

    vi.clearAllMocks();
    await bugReportRepository.listComments(REPORT_ID, {
      includeInternal: true,
    });
    // No is_internal filter — admin triage notes are included.
    expect(mocks.drizzle.and).not.toHaveBeenCalled();
    expect(mocks.drizzle.eq).toHaveBeenCalledWith(
      { name: "report_id" },
      REPORT_ID,
    );
  });

  it("adds a comment trimmed with isInternal off unless requested", async () => {
    mocks.state.rows = [
      {
        id: "c2",
        reportId: REPORT_ID,
        userId: OWNER,
        body: "Repro attached.",
        isInternal: false,
        createdAt: new Date(),
      },
    ];
    const comment = await bugReportRepository.addComment({
      reportId: REPORT_ID,
      userId: OWNER,
      body: "  Repro attached.  ",
    });
    expect(mocks.chain.values).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      userId: OWNER,
      body: "Repro attached.",
      isInternal: false,
    });
    expect(comment.id).toBe("c2");

    await bugReportRepository.addComment({
      reportId: REPORT_ID,
      userId: OWNER,
      body: "internal",
      isInternal: true,
    });
    expect(mocks.chain.values).toHaveBeenLastCalledWith({
      reportId: REPORT_ID,
      userId: OWNER,
      body: "internal",
      isInternal: true,
    });
  });
});

describe("bugReportRepository — public aggregates", () => {
  it("normalises leaderboard rows from both result shapes", async () => {
    const entry = {
      userId: OWNER,
      userName: "Ada",
      userEmail: "ada@example.com",
      userImage: null,
      acceptedCount: 3,
      awardedCount: 1,
      totalAwardedCents: 25_000,
      currency: "USD",
    };

    mocks.state.executeResult = [entry];
    expect(await bugReportRepository.leaderboard(10)).toEqual([entry]);

    mocks.state.executeResult = { rows: [entry] };
    expect(await bugReportRepository.leaderboard()).toEqual([entry]);

    // A rows-less result must degrade to an empty board.
    mocks.state.executeResult = { rows: undefined };
    expect(await bugReportRepository.leaderboard()).toEqual([]);
  });

  it("coerces stats from the raw SQL row and defaults to zeros", async () => {
    mocks.state.executeResult = [
      {
        totalReports: "12",
        acceptedReports: "5",
        awardedReports: "2",
        totalAwardedCents: "125000",
      },
    ];
    expect(await bugReportRepository.stats()).toEqual({
      totalReports: 12,
      acceptedReports: 5,
      awardedReports: 2,
      totalAwardedCents: 125000,
    });

    mocks.state.executeResult = [];
    expect(await bugReportRepository.stats()).toEqual({
      totalReports: 0,
      acceptedReports: 0,
      awardedReports: 0,
      totalAwardedCents: 0,
    });
  });
});
