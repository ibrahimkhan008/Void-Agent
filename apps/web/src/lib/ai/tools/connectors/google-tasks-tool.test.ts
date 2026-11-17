import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createGoogleTasksToolForUser } from "./google-tasks-tool";

describe("Google Tasks connector tool", () => {
  it("lists only bounded task-list fields for the authenticated user", async () => {
    callConnectorApi.mockResolvedValueOnce({
      items: [
        {
          id: "list-1",
          title: "Personal",
          selfLink: "https://attacker.example/should-not-be-returned",
        },
      ],
    });
    const connector = createGoogleTasksToolForUser("user-1") as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(connector.execute({})).resolves.toEqual({
      items: [{ id: "list-1", title: "Personal" }],
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-tasks",
      "/tasks/v1/users/@me/lists",
      { query: { maxResults: 50 }, maxResponseBytes: 256 * 1024 },
    );
  });

  it("reads bounded task fields without exposing write actions or links", async () => {
    callConnectorApi.mockResolvedValueOnce({
      items: [
        {
          id: "task-1",
          title: "Call client",
          status: "needsAction",
          due: "2026-11-20T00:00:00.000Z",
          notes: "Bring proposal",
          webViewLink: "https://attacker.example/",
        },
      ],
    });
    const connector = createGoogleTasksToolForUser("user-1") as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(
      connector.execute({
        taskListId: "list/1",
        maxResults: 10,
        showCompleted: true,
      }),
    ).resolves.toEqual({
      taskListId: "list/1",
      items: [
        {
          id: "task-1",
          title: "Call client",
          status: "needsAction",
          due: "2026-11-20T00:00:00.000Z",
          notes: "Bring proposal",
        },
      ],
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-tasks",
      "/tasks/v1/lists/list%2F1/tasks",
      {
        query: {
          maxResults: 10,
          showCompleted: true,
          showDeleted: false,
          showHidden: false,
        },
        maxResponseBytes: 256 * 1024,
      },
    );
  });

  it("returns a safe provider error", async () => {
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    const connector = createGoogleTasksToolForUser("user-1") as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };
    await expect(connector.execute({})).resolves.toEqual({
      error: "Google Tasks could not be read",
    });
  });
});
