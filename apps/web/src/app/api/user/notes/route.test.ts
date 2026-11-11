import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  preferencesByUser,
  getPreferences,
  updatePreferences,
  setCurrentUserId,
  currentUserId,
} = vi.hoisted(() => {
  const preferencesByUser = new Map<string, Record<string, unknown>>();
  const auth = { userId: "owner-a" };
  return {
    preferencesByUser,
    currentUserId: auth,
    setCurrentUserId: (userId: string) => {
      auth.userId = userId;
    },
    getPreferences: vi.fn(
      async (userId: string) => preferencesByUser.get(userId) ?? null,
    ),
    updatePreferences: vi.fn(
      async (userId: string, preferences: Record<string, unknown>) => {
        preferencesByUser.set(userId, preferences);
        return { preferences };
      },
    ),
  };
});

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (request: Request, session: unknown) => unknown) =>
    (request: Request) =>
      handler(request, { user: { id: currentUserId.userId } }),
}));

vi.mock("lib/db/repository", () => ({
  userRepository: { getPreferences, updatePreferences },
}));

import { DELETE, GET, POST, PUT } from "./route";

const request = (
  method: string,
  body?: unknown,
  url = "http://localhost/api/user/notes",
) =>
  new NextRequest(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
  });
const responseJson = (response: Response) => response.json();

describe("/api/user/notes", () => {
  beforeEach(() => {
    preferencesByUser.clear();
    setCurrentUserId("owner-a");
    getPreferences.mockClear();
    updatePreferences.mockClear();
  });

  it("creates and lists notes under the authenticated user's preferences", async () => {
    preferencesByUser.set("owner-a", {
      botName: "Custom",
      profession: "Engineer",
    });
    const post = await POST(
      request("POST", {
        title: "  A useful answer  ",
        markdown: "# A useful answer\n\nBody",
        citations: [
          { id: 1, title: "Docs", url: "https://docs.example/reference" },
          { id: 2, title: "Unsafe", url: "javascript:alert(1)" },
        ],
      }),
    );
    expect(post.status).toBe(201);
    const created = await responseJson(post);
    expect(created.title).toBe("A useful answer");
    expect(created.citations).toEqual([
      { id: 1, title: "Docs", url: "https://docs.example/reference" },
    ]);

    const stored = preferencesByUser.get("owner-a");
    expect(stored?.botName).toBe("Custom");
    expect(stored?.profession).toBe("Engineer");
    expect((stored?.savedNotes as unknown[]).length).toBe(1);

    const list = await GET(request("GET"));
    expect(await responseJson(list)).toHaveLength(1);
    setCurrentUserId("owner-b");
    const otherUserList = await GET(request("GET"));
    expect(await responseJson(otherUserList)).toEqual([]);
  });

  it("updates and deletes only notes owned by the authenticated user", async () => {
    const note = {
      id: "note-a",
      title: "Before",
      markdown: "Old body",
      citations: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    preferencesByUser.set("owner-a", { savedNotes: [note] });

    const crossUserUpdate = await PUT(
      request("PUT", { ...note, id: "note-b", title: "Changed" }),
    );
    expect(crossUserUpdate.status).toBe(404);

    setCurrentUserId("owner-a");
    const updated = await PUT(
      request("PUT", { ...note, title: "After", markdown: "New body" }),
    );
    expect(updated.status).toBe(200);
    const updatedNote = await responseJson(updated);
    expect(updatedNote.createdAt).toBe(note.createdAt);
    expect(updatedNote.title).toBe("After");

    setCurrentUserId("owner-b");
    const crossUserDelete = await DELETE(
      request("DELETE", undefined, "http://localhost/api/user/notes?id=note-a"),
    );
    expect(crossUserDelete.status).toBe(404);

    setCurrentUserId("owner-a");
    const deleted = await DELETE(
      request("DELETE", undefined, "http://localhost/api/user/notes?id=note-a"),
    );
    expect(deleted.status).toBe(200);
    expect(preferencesByUser.get("owner-a")?.savedNotes).toEqual([]);
  });

  it("rejects malformed, oversized, and out-of-bounds inputs", async () => {
    expect((await POST(request("POST", "null"))).status).toBe(400);
    expect((await POST(request("POST", "{"))).status).toBe(400);
    expect(
      (
        await POST(
          request("POST", { title: "Note", markdown: "x".repeat(50_001) }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request(
            "POST",
            `{"title":"Note","markdown":"${"x".repeat(410_000)}"}`,
          ),
        )
      ).status,
    ).toBe(413);
  });
});
