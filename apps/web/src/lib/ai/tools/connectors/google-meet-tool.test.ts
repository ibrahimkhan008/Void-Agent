import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createGoogleMeetToolForUser } from "./google-meet-tool";

beforeEach(() => vi.clearAllMocks());

function getTool() {
  return createGoogleMeetToolForUser("user-1") as unknown as {
    inputSchema: { safeParse: (value: unknown) => { success: boolean } };
    execute: (input: Record<string, unknown>) => Promise<unknown>;
  };
}

describe("Google Meet connector tool", () => {
  it("lists only bounded conference history fields for the connected user", async () => {
    callConnectorApi.mockResolvedValueOnce({
      conferenceRecords: [
        {
          name: "conferenceRecords/record-1",
          startTime: "2026-11-17T10:00:00Z",
          endTime: "2026-11-17T10:30:00Z",
          space: "spaces/space-1",
          expireTime: "private",
          organizer: "private@example.test",
        },
      ],
      nextPageToken: "next-page",
    });

    await expect(
      getTool().execute({ action: "list_conferences" }),
    ).resolves.toEqual({
      action: "list_conferences",
      items: [
        {
          name: "conferenceRecords/record-1",
          startTime: "2026-11-17T10:00:00Z",
          endTime: "2026-11-17T10:30:00Z",
          space: "spaces/space-1",
        },
      ],
      nextPageToken: "next-page",
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-meet",
      "/v2/conferenceRecords",
      { query: { pageSize: 25 }, maxResponseBytes: 256 * 1024 },
    );
  });

  it("lists transcripts only for a validated conference resource", async () => {
    callConnectorApi.mockResolvedValueOnce({
      transcripts: [
        {
          name: "conferenceRecords/rec-1/transcripts/transcript-1",
          state: "FILE_GENERATED",
          startTime: "2026-11-17T10:00:00Z",
          endTime: "2026-11-17T10:30:00Z",
          driveDestination: { file: "private" },
        },
      ],
    });

    await expect(
      getTool().execute({
        action: "list_transcripts",
        conferenceRecord: "conferenceRecords/rec-1",
      }),
    ).resolves.toEqual({
      action: "list_transcripts",
      items: [
        {
          name: "conferenceRecords/rec-1/transcripts/transcript-1",
          state: "FILE_GENERATED",
          startTime: "2026-11-17T10:00:00Z",
          endTime: "2026-11-17T10:30:00Z",
        },
      ],
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-meet",
      "/v2/conferenceRecords/rec-1/transcripts",
      { query: { pageSize: 25 }, maxResponseBytes: 256 * 1024 },
    );
  });

  it("returns bounded transcript entries without raw participant resources", async () => {
    callConnectorApi.mockResolvedValueOnce({
      transcriptEntries: [
        {
          name: "conferenceRecords/rec-1/transcripts/tr-1/entries/e-1",
          text: "Meeting notes",
          startTime: "2026-11-17T10:00:00Z",
          participant: {
            displayName: "Alex",
            signedinUser: { user: "private-id" },
          },
        },
      ],
    });
    const transcript = "conferenceRecords/rec-1/transcripts/tr-1";

    await expect(
      getTool().execute({ action: "list_transcript_entries", transcript }),
    ).resolves.toEqual({
      action: "list_transcript_entries",
      items: [
        {
          name: `${transcript}/entries/e-1`,
          text: "Meeting notes",
          startTime: "2026-11-17T10:00:00Z",
          participant: { displayName: "Alex" },
        },
      ],
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-meet",
      `/v2/${transcript}/entries`,
      { query: { pageSize: 25 }, maxResponseBytes: 256 * 1024 },
    );
  });

  it("rejects resource names that could escape the provider resource path", async () => {
    const tool = getTool();
    await expect(
      tool.execute({
        action: "list_transcripts",
        conferenceRecord: "conferenceRecords/../users/me",
      }),
    ).resolves.toEqual({ error: "A valid conferenceRecord is required" });
    await expect(
      tool.execute({
        action: "list_transcript_entries",
        transcript: "https://attacker.test/transcript",
      }),
    ).resolves.toEqual({
      error: "A valid transcript resource name is required",
    });
    expect(callConnectorApi).not.toHaveBeenCalled();
    expect(
      tool.inputSchema.safeParse({ action: "list_conferences", pageSize: 101 })
        .success,
    ).toBe(false);
  });

  it("returns a safe provider error", async () => {
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    await expect(
      getTool().execute({ action: "list_conferences" }),
    ).resolves.toEqual({ error: "Google Meet data could not be read" });
  });
});
