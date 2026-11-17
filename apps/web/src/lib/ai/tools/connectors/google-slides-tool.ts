import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  presentationId: z.string().trim().min(1).max(256),
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

export function createGoogleSlidesToolForUser(userId: string) {
  return tool({
    description:
      "Read text from a Google Slides presentation the signed-in user can access. This tool is read-only and does not edit slides.",
    inputSchema,
    execute: async ({ presentationId }) => {
      try {
        const presentation = await callConnectorApi(
          userId,
          "google-slides",
          `/v1/presentations/${encodeURIComponent(presentationId)}`,
          { maxResponseBytes: 256 * 1024 },
        );
        const fullText = collectText(presentation.slides).join("");
        const text = fullText.slice(0, 60_000);
        return {
          presentationId,
          title:
            typeof presentation.title === "string" ? presentation.title : "",
          slideCount: Array.isArray(presentation.slides)
            ? presentation.slides.length
            : 0,
          text,
          truncated: fullText.length > text.length,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Slides could not be read",
        };
      }
    },
  });
}
