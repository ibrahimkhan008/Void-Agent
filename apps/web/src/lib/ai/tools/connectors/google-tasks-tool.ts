import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  taskListId: z.string().trim().min(1).max(256).optional(),
  maxResults: z.number().int().min(1).max(100).default(50),
  pageToken: z.string().trim().min(1).max(2_000).optional(),
  showCompleted: z.boolean().default(false),
});

export function createGoogleTasksToolForUser(userId: string) {
  return tool({
    description:
      "List the signed-in user's Google Tasks lists, or read tasks from one list. This tool is read-only and never creates, updates, or deletes tasks.",
    inputSchema,
    execute: async ({ taskListId, maxResults, pageToken, showCompleted }) => {
      try {
        const pageSize = maxResults ?? 50;
        const path = taskListId
          ? `/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`
          : "/tasks/v1/users/@me/lists";
        const result = await callConnectorApi(userId, "google-tasks", path, {
          query: {
            maxResults: pageSize,
            ...(pageToken ? { pageToken } : {}),
            ...(taskListId
              ? {
                  showCompleted: showCompleted ?? false,
                  showDeleted: false,
                  showHidden: false,
                }
              : {}),
          },
          maxResponseBytes: 256 * 1024,
        });
        const sourceItems = Array.isArray(result.items) ? result.items : [];
        const items = sourceItems.slice(0, pageSize).map((item) => {
          const record =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          return taskListId
            ? {
                id: typeof record.id === "string" ? record.id : "",
                title:
                  typeof record.title === "string"
                    ? record.title.slice(0, 1_000)
                    : "",
                status:
                  typeof record.status === "string"
                    ? record.status
                    : "needsAction",
                ...(typeof record.due === "string" ? { due: record.due } : {}),
                ...(typeof record.notes === "string"
                  ? { notes: record.notes.slice(0, 2_000) }
                  : {}),
              }
            : {
                id: typeof record.id === "string" ? record.id : "",
                title:
                  typeof record.title === "string"
                    ? record.title.slice(0, 1_000)
                    : "",
              };
        });
        return {
          ...(taskListId ? { taskListId } : {}),
          items,
          ...(typeof result.nextPageToken === "string"
            ? { nextPageToken: result.nextPageToken.slice(0, 2_000) }
            : {}),
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Tasks could not be read",
        };
      }
    },
  });
}
