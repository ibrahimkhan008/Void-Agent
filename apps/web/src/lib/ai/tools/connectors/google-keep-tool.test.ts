import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createGoogleKeepToolForUser } from "./google-keep-tool";

describe("Google Keep connector tool", () => {
  it("returns bounded note text and list content without permissions or attachments", async () => {
    callConnectorApi.mockResolvedValueOnce({
      notes: [
        {
          name: "notes/note-1",
          title: "Project checklist",
          updateTime: "2026-11-17T10:00:00Z",
          body: {
            list: {
              listItems: [
                { text: { text: "Review scope" }, checked: false },
                { text: { text: "Ship safely" }, checked: true },
              ],
            },
          },
          permissions: [{ email: "private@example.test" }],
          attachments: [{ name: "private-file" }],
        },
      ],
      nextPageToken: "next-page",
    });
    const connector = createGoogleKeepToolForUser("user-1") as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(connector.execute({})).resolves.toEqual({
      notes: [
        {
          id: "notes/note-1",
          title: "Project checklist",
          text: "Review scope\nShip safely",
          updatedAt: "2026-11-17T10:00:00Z",
        },
      ],
      nextPageToken: "next-page",
      truncated: false,
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-keep",
      "/v1/notes",
      { query: { pageSize: 20 }, maxResponseBytes: 256 * 1024 },
    );
  });

  it("returns a safe provider error", async () => {
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    const connector = createGoogleKeepToolForUser("user-1") as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };
    await expect(connector.execute({})).resolves.toEqual({
      error: "Google Keep notes could not be read",
    });
  });
});
