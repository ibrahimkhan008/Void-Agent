import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  pageSize: z.number().int().min(1).max(50).default(20),
  pageToken: z.string().trim().min(1).max(2_000).optional(),
});

function collectSectionText(section: unknown, chunks: string[] = []): string[] {
  if (!section || typeof section !== "object") return chunks;
  const record = section as Record<string, unknown>;
  const text = record.text;
  if (text && typeof text === "object") {
    const value = (text as Record<string, unknown>).text;
    if (typeof value === "string") chunks.push(value);
  }
  const list = record.list;
  const items =
    list && typeof list === "object"
      ? (list as Record<string, unknown>).listItems
      : undefined;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const itemText = entry.text;
      if (itemText && typeof itemText === "object") {
        const value = (itemText as Record<string, unknown>).text;
        if (typeof value === "string") chunks.push(value);
      }
      if (Array.isArray(entry.childListItems)) {
        for (const child of entry.childListItems) {
          if (!child || typeof child !== "object") continue;
          const childText = (child as Record<string, unknown>).text;
          if (childText && typeof childText === "object") {
            const value = (childText as Record<string, unknown>).text;
            if (typeof value === "string") chunks.push(value);
          }
        }
      }
    }
  }
  return chunks;
}

export function createGoogleKeepToolForUser(userId: string) {
  return tool({
    description:
      "List and read bounded Google Keep notes accessible to the signed-in user. This tool is read-only; it cannot create, update, delete, or share notes.",
    inputSchema,
    execute: async ({ pageSize, pageToken }) => {
      try {
        const result = await callConnectorApi(
          userId,
          "google-keep",
          "/v1/notes",
          {
            query: {
              pageSize: pageSize ?? 20,
              ...(pageToken ? { pageToken } : {}),
            },
            maxResponseBytes: 256 * 1024,
          },
        );
        const sourceNotes = Array.isArray(result.notes) ? result.notes : [];
        let remainingCharacters = 40_000;
        let truncated = sourceNotes.length > (pageSize ?? 20);
        const notes = sourceNotes.slice(0, pageSize ?? 20).flatMap((note) => {
          if (!note || typeof note !== "object" || remainingCharacters <= 0) {
            truncated = true;
            return [];
          }
          const record = note as Record<string, unknown>;
          const fullText = collectSectionText(record.body).join("\n");
          const limit = Math.min(4_000, remainingCharacters);
          const text = fullText.slice(0, limit);
          remainingCharacters -= text.length;
          if (fullText.length > text.length) truncated = true;
          return [
            {
              id:
                typeof record.name === "string"
                  ? record.name.slice(0, 256)
                  : "",
              title:
                typeof record.title === "string"
                  ? record.title.slice(0, 500)
                  : "",
              text,
              ...(typeof record.updateTime === "string"
                ? { updatedAt: record.updateTime }
                : {}),
            },
          ];
        });
        return {
          notes,
          ...(typeof result.nextPageToken === "string"
            ? { nextPageToken: result.nextPageToken.slice(0, 2_000) }
            : {}),
          truncated,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Keep notes could not be read",
        };
      }
    },
  });
}
