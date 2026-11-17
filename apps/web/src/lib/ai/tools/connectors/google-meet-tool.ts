import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum([
    "list_conferences",
    "list_transcripts",
    "list_transcript_entries",
  ]),
  conferenceRecord: z.string().trim().min(1).max(256).optional(),
  transcript: z.string().trim().min(1).max(512).optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
  pageToken: z.string().trim().min(1).max(2_000).optional(),
});

const RECORD_NAME = /^conferenceRecords\/[A-Za-z0-9_-]{1,200}$/;
const TRANSCRIPT_NAME =
  /^conferenceRecords\/[A-Za-z0-9_-]{1,200}\/transcripts\/[A-Za-z0-9_-]{1,200}$/;

function boundedString(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.slice(0, limit) : undefined;
}

export function createGoogleMeetToolForUser(userId: string) {
  return tool<z.infer<typeof inputSchema>, unknown, never>({
    description:
      "Read your Google Meet conference history, available transcripts, or transcript entries. Read-only; it cannot create, change, or end meetings. Use conferenceRecord and transcript resource names returned by earlier calls.",
    inputSchema,
    execute: async ({
      action,
      conferenceRecord,
      transcript,
      pageSize,
      pageToken,
    }) => {
      try {
        let path: string;
        if (action === "list_conferences") {
          path = "/v2/conferenceRecords";
        } else if (action === "list_transcripts") {
          if (!conferenceRecord || !RECORD_NAME.test(conferenceRecord)) {
            return { error: "A valid conferenceRecord is required" };
          }
          path = `/v2/${conferenceRecord}/transcripts`;
        } else {
          if (!transcript || !TRANSCRIPT_NAME.test(transcript)) {
            return { error: "A valid transcript resource name is required" };
          }
          path = `/v2/${transcript}/entries`;
        }

        const result = await callConnectorApi(userId, "google-meet", path, {
          query: {
            pageSize: pageSize ?? 25,
            ...(pageToken ? { pageToken } : {}),
          },
          maxResponseBytes: 256 * 1024,
        });
        const source =
          action === "list_conferences"
            ? result.conferenceRecords
            : action === "list_transcripts"
              ? result.transcripts
              : result.transcriptEntries;
        const collection = Array.isArray(source) ? source : [];
        let truncated = collection.length > (pageSize ?? 25);
        let remainingTranscriptCharacters = 40_000;
        const items = collection.slice(0, pageSize ?? 25).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          if (action === "list_conferences") {
            return [
              {
                ...(boundedString(record.name, 256)
                  ? { name: boundedString(record.name, 256) }
                  : {}),
                ...(boundedString(record.startTime, 64)
                  ? { startTime: boundedString(record.startTime, 64) }
                  : {}),
                ...(boundedString(record.endTime, 64)
                  ? { endTime: boundedString(record.endTime, 64) }
                  : {}),
                ...(boundedString(record.space, 256)
                  ? { space: boundedString(record.space, 256) }
                  : {}),
              },
            ];
          }
          if (action === "list_transcripts") {
            return [
              {
                ...(boundedString(record.name, 512)
                  ? { name: boundedString(record.name, 512) }
                  : {}),
                ...(boundedString(record.state, 64)
                  ? { state: boundedString(record.state, 64) }
                  : {}),
                ...(boundedString(record.startTime, 64)
                  ? { startTime: boundedString(record.startTime, 64) }
                  : {}),
                ...(boundedString(record.endTime, 64)
                  ? { endTime: boundedString(record.endTime, 64) }
                  : {}),
              },
            ];
          }
          const participant = record.participant;
          const fullText = boundedString(record.text, 40_000) ?? "";
          const textLimit = Math.min(4_000, remainingTranscriptCharacters);
          const text = fullText.slice(0, textLimit);
          remainingTranscriptCharacters -= text.length;
          if (fullText.length > text.length) truncated = true;
          return [
            {
              ...(boundedString(record.name, 512)
                ? { name: boundedString(record.name, 512) }
                : {}),
              ...(text ? { text } : {}),
              ...(boundedString(record.startTime, 64)
                ? { startTime: boundedString(record.startTime, 64) }
                : {}),
              ...(participant &&
              typeof participant === "object" &&
              boundedString(
                (participant as Record<string, unknown>).displayName,
                256,
              )
                ? {
                    participant: {
                      displayName: boundedString(
                        (participant as Record<string, unknown>).displayName,
                        256,
                      ),
                    },
                  }
                : {}),
            },
          ];
        });
        return {
          action,
          items,
          ...(typeof result.nextPageToken === "string"
            ? { nextPageToken: result.nextPageToken.slice(0, 2_000) }
            : {}),
          ...(truncated ? { truncated: true } : {}),
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Meet data could not be read",
        };
      }
    },
  });
}
