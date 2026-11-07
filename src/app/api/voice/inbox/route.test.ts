import { PgDialect } from "drizzle-orm/pg-core";
import { encodeVoiceInboxCursor } from "lib/voice/voice-inbox";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  select: vi.fn(),
  predicates: [] as unknown[],
  limit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

function query(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === "where") mocks.predicates = args;
      if (method === "limit") {
        mocks.limit(...args);
        return Promise.resolve(rows);
      }
      return builder;
    });
  }
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.limit.mockReset();
  mocks.select.mockReturnValue(
    query([
      {
        id: "voice-message-1",
        threadId: "thread-1",
        title: null as unknown as string,
        parts: [
          { type: "text", text: "Remember this" },
          { type: "image", image: "private" },
        ],
        metadata: { source: "voice_device", deviceId: "device-1" },
        createdAt: new Date("2026-11-07T12:00:00.000Z"),
      },
    ]),
  );
});

describe("GET /api/voice/inbox", () => {
  it("returns only the signed-in user's bounded voice messages and a no-store response", async () => {
    const response = await GET(
      new Request("https://void.test/api/voice/inbox"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rate).toHaveBeenCalledWith({
      kind: "voice-inbox-list",
      id: "owner-1",
      limit: 60,
      windowMs: 60_000,
    });
    expect(
      new PgDialect().sqlToQuery(mocks.predicates[0] as never).sql,
    ).toContain('"chat_thread"."user_id" = $1');
    expect(await response.json()).toMatchObject({
      items: [
        {
          id: "voice-message-1",
          threadId: "thread-1",
          text: "Remember this",
          source: "voice_device",
          title: "Voice conversation",
        },
      ],
      nextCursor: null,
    });
  });

  it("requires authentication, throttles, and rejects malformed or empty cursors", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(
      (await GET(new Request("https://void.test/api/voice/inbox"))).status,
    ).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rate.mockResolvedValue({ allowed: false });
    expect(
      (await GET(new Request("https://void.test/api/voice/inbox"))).status,
    ).toBe(429);
    mocks.rate.mockResolvedValue({ allowed: true });
    expect(
      (await GET(new Request("https://void.test/api/voice/inbox?cursor=bad")))
        .status,
    ).toBe(400);
    expect(
      (await GET(new Request("https://void.test/api/voice/inbox?cursor=")))
        .status,
    ).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses a stable timestamp/id cursor and caps each page before encoding the next cursor", async () => {
    const timestamp = "2026-11-07T12:00:00.000Z";
    const pagePlusOne = Array.from({ length: 31 }, (_, index) => ({
      id: `voice-message-${index}`,
      threadId: "thread-1",
      title: "Voice conversation",
      parts: [{ type: "text", text: `Transcript ${index}` }],
      metadata: { source: "voice_realtime" },
      createdAt: new Date(Date.parse(timestamp) - index),
    }));
    mocks.select.mockReturnValue(query(pagePlusOne));
    const cursor = encodeVoiceInboxCursor({
      createdAt: timestamp,
      id: "before-this",
    });
    const response = await GET(
      new Request(
        `https://void.test/api/voice/inbox?cursor=${encodeURIComponent(cursor)}`,
      ),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items).toHaveLength(30);
    expect(result.nextCursor).toBeTruthy();
    expect(mocks.limit).toHaveBeenCalledWith(31);
    const where = new PgDialect().sqlToQuery(mocks.predicates[0] as never).sql;
    expect(where).toContain('"chat_message"."id" <');
    expect(where).toContain('"chat_message"."created_at" =');
  });
});
