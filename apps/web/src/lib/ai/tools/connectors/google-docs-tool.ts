import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  documentId: z.string().trim().min(1).max(256),
});

function collectText(value: unknown, chunks: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, chunks);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const textRun = record.textRun;
    if (
      textRun &&
      typeof textRun === "object" &&
      typeof (textRun as Record<string, unknown>).content === "string"
    ) {
      chunks.push((textRun as Record<string, string>).content);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "textRun") collectText(child, chunks);
    }
  }
  return chunks;
}

export function createGoogleDocsToolForUser(userId: string) {
  return tool({
    description:
      "Read the text of a Google Doc the signed-in user can access. This tool is read-only; it cannot create or edit documents.",
    inputSchema,
    execute: async ({ documentId }) => {
      try {
        const document = await callConnectorApi(
          userId,
          "google-docs",
          `/v1/documents/${encodeURIComponent(documentId)}`,
          { maxResponseBytes: 256 * 1024 },
        );
        const fullText = collectText(document.body).join("");
        const text = fullText.slice(0, 60_000);
        return {
          documentId,
          title: typeof document.title === "string" ? document.title : "",
          text,
          truncated: fullText.length > text.length,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Docs could not be read",
        };
      }
    },
  });
}
