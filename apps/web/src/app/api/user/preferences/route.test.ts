import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { preferencesByUser, updatePreferences } = vi.hoisted(() => {
  const preferencesByUser = new Map<string, Record<string, unknown>>();
  const auth = { userId: "owner-a" };
  return {
    preferencesByUser,
    updatePreferences: vi.fn(
      async (userId: string, value: Record<string, unknown>) => {
        preferencesByUser.set(userId, value);
        return { preferences: value };
      },
    ),
    currentUserId: auth,
  };
});

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (request: Request, session: unknown) => unknown) =>
    (request: Request) =>
      handler(request, { user: { id: "owner-a" } }),
}));

vi.mock("lib/db/repository", () => ({
  userRepository: {
    getPreferences: vi.fn(
      async (userId: string) => preferencesByUser.get(userId) ?? null,
    ),
    updatePreferences,
  },
}));

import { GET, PUT } from "./route";

describe("/api/user/preferences", () => {
  beforeEach(() => {
    preferencesByUser.clear();
    updatePreferences.mockClear();
  });

  it("retains saved notes when updating other preference fields", async () => {
    const savedNotes = [
      {
        id: "n1",
        title: "Private note",
        markdown: "# Private note",
        citations: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    preferencesByUser.set("owner-a", { savedNotes, profession: "Old role" });

    const response = await PUT(
      new NextRequest("http://localhost/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botName: "Void-Agent" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(preferencesByUser.get("owner-a")).toEqual({
      savedNotes,
      profession: "Old role",
      botName: "Void-Agent",
    });
  });

  it("never returns encrypted hosted provider credentials", async () => {
    preferencesByUser.set("owner-a", {
      profession: "Engineer",
      aiProviderKeys: { openai: "ciphertext" },
    });
    const response = await GET(
      new NextRequest("http://localhost/api/user/preferences"),
    );
    expect(await response.json()).toEqual({ profession: "Engineer" });

    const update = await PUT(
      new NextRequest("http://localhost/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botName: "Assistant" }),
      }),
    );
    expect(JSON.stringify(await update.json())).not.toContain("ciphertext");
  });
});
