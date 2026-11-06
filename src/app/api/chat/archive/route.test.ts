import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectThread: vi.fn(),
  selectMessagesForExport: vi.fn(),
  insertThread: vi.fn(),
  insertMessages: vi.fn(),
  deleteThread: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectThread: mocks.selectThread,
    selectMessagesForExport: mocks.selectMessagesForExport,
    insertThread: mocks.insertThread,
    insertMessages: mocks.insertMessages,
    deleteThread: mocks.deleteThread,
  },
}));

import {
  CONVERSATION_ARCHIVE_FORMAT,
  CONVERSATION_ARCHIVE_VERSION,
  MAX_CONVERSATION_ARCHIVE_BYTES,
} from "lib/chat/conversation-archive";
import { GET, POST } from "./route";

const archive = {
  format: CONVERSATION_ARCHIVE_FORMAT,
  version: CONVERSATION_ARCHIVE_VERSION,
  exportedAt: "2026-11-06T10:00:00.000Z",
  title: "Imported conversation",
  messages: [
    { role: "user", text: "Question" },
    { role: "assistant", text: "Answer" },
  ],
};

function importRequest(
  body: string,
  headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost:3000",
  },
) {
  return new Request("http://localhost:3000/api/chat/archive", {
    method: "POST",
    headers,
    body,
  });
}

describe("conversation archive API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.selectThread.mockResolvedValue({
      id: "thread-1",
      userId: "owner-1",
      title: "A conversation",
    });
    mocks.selectMessagesForExport.mockResolvedValue([
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "text", text: "Hello" },
          { type: "file", url: "https://private.test/file" },
        ],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "tool-call", toolName: "dangerous", input: {} }],
      },
    ]);
    mocks.insertThread.mockResolvedValue(undefined);
    mocks.insertMessages.mockResolvedValue([]);
    mocks.deleteThread.mockResolvedValue(undefined);
  });

  it("exports an authenticated owner's conversation as bounded text-only JSON", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/chat/archive?threadId=thread-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(data.title).toBe("A conversation");
    expect(data.messages).toEqual([{ role: "user", text: "Hello" }]);
    expect(JSON.stringify(data)).not.toContain("private.test");
    expect(JSON.stringify(data)).not.toContain("dangerous");
    expect(mocks.selectMessagesForExport).toHaveBeenCalledWith(
      "thread-1",
      1001,
    );
  });

  it("does not export another user's conversation", async () => {
    mocks.selectThread.mockResolvedValue({
      id: "thread-1",
      userId: "someone-else",
      title: "Private",
    });
    const response = await GET(
      new Request("http://localhost:3000/api/chat/archive?threadId=thread-1"),
    );

    expect(response.status).toBe(404);
    expect(mocks.selectMessagesForExport).not.toHaveBeenCalled();
  });

  it("requires a signed-in user for both archive operations", async () => {
    mocks.getSession.mockResolvedValue(null);
    const getResponse = await GET(
      new Request("http://localhost:3000/api/chat/archive?threadId=thread-1"),
    );
    const postResponse = await POST(importRequest(JSON.stringify(archive)));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mocks.selectThread).not.toHaveBeenCalled();
    expect(mocks.insertThread).not.toHaveBeenCalled();
  });

  it("rejects export when the bounded repository query detects excess messages", async () => {
    mocks.selectMessagesForExport.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: `m${index}`,
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      })),
    );
    const response = await GET(
      new Request("http://localhost:3000/api/chat/archive?threadId=thread-1"),
    );

    expect(response.status).toBe(413);
  });

  it("rejects cross-origin, malformed, and oversized imports before persistence", async () => {
    const crossOrigin = await POST(
      importRequest(JSON.stringify(archive), {
        "content-type": "application/json",
        origin: "https://attacker.example",
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const malformed = await POST(
      importRequest(JSON.stringify({ ...archive, injected: true })),
    );
    expect(malformed.status).toBe(400);

    const oversized = await POST(
      importRequest(
        JSON.stringify({
          ...archive,
          title: "x".repeat(MAX_CONVERSATION_ARCHIVE_BYTES),
        }),
      ),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.insertThread).not.toHaveBeenCalled();
  });

  it("imports text-only turns under the signed-in user with new message IDs", async () => {
    const response = await POST(importRequest(JSON.stringify(archive)));
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result).toMatchObject({ title: archive.title });
    expect(result.threadId).toEqual(expect.any(String));
    expect(mocks.insertThread).toHaveBeenCalledWith({
      id: result.threadId,
      title: archive.title,
      userId: "owner-1",
    });
    const inserted = mocks.insertMessages.mock.calls[0][0];
    expect(inserted).toHaveLength(2);
    expect(
      inserted.map((message: { role: string; parts: unknown[] }) => ({
        role: message.role,
        parts: message.parts,
      })),
    ).toEqual([
      { role: "user", parts: [{ type: "text", text: "Question" }] },
      { role: "assistant", parts: [{ type: "text", text: "Answer" }] },
    ]);
    expect(
      new Set(inserted.map((message: { id: string }) => message.id)).size,
    ).toBe(2);
  });

  it("removes a partially created conversation if message persistence fails", async () => {
    mocks.insertMessages.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(importRequest(JSON.stringify(archive)));

    expect(response.status).toBe(500);
    expect(mocks.deleteThread).toHaveBeenCalledWith(
      mocks.insertThread.mock.calls[0][0].id,
    );
  });
});
