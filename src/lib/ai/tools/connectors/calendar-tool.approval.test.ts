import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  refreshConnectorToken: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/calendar-approval-repository.pg", () => ({
  calendarApprovalRepository: { consume: mocks.consume },
}));

import { createCalendarToolForUser } from "./calendar-tool";

const event = {
  action: "create_event",
  summary: "Planning",
  start: "2026-06-03T10:00:00Z",
  end: "2026-06-03T11:00:00Z",
};

async function execute(input: unknown) {
  const created = createCalendarToolForUser("user-1") as unknown as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("calendar-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "created-event" }), { status: 200 })));
});

describe("Google Calendar mutation approvals", () => {
  it("refuses a mutation without a valid approval before making a provider request", async () => {
    const result = await execute(event) as { error?: string };
    expect(result.error).toContain("user-reviewed approval");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consumes the exact single-use approved payload before creating an event", async () => {
    const payload = { ...event, approvalToken: "a".repeat(40) };
    const result = await execute(payload) as { success?: boolean };
    expect(mocks.consume).toHaveBeenCalledWith("user-1", payload.approvalToken, event);
    expect(fetch).toHaveBeenCalledWith("https://www.googleapis.com/calendar/v3/events", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer calendar-access-token" }),
    }));
    expect(result.success).toBe(true);
  });

  it("does not call Calendar when approval was consumed, changed, or expired", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({ ...event, approvalToken: "b".repeat(40) }) as { error?: string };
    expect(result.error).toContain("not approved");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the current event etag for updates and deletes", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ etag: '"rev-7"' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "event-1" }), { status: 200 }));
    await execute({
      action: "update_event",
      eventId: "event/1",
      summary: "Planning",
      start: "2026-06-03T10:00:00Z",
      end: "2026-06-03T11:00:00Z",
      approvalToken: "c".repeat(40),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.googleapis.com/calendar/v3/events/event%2F1", expect.objectContaining({
      headers: { Authorization: "Bearer calendar-access-token" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://www.googleapis.com/calendar/v3/events/event%2F1", expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "If-Match": '"rev-7"' }),
    }));
  });

  it("rejects a deletion if the live title or time no longer matches the reviewed event", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      summary: "Different event",
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      etag: '"rev-8"',
    }), { status: 200 }));
    const result = await execute({
      action: "delete_event",
      eventId: "event-1",
      summary: "Planning",
      start: event.start,
      end: event.end,
      approvalToken: "d".repeat(40),
    }) as { error?: string };
    expect(result.error).toContain("changed since it was reviewed");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
