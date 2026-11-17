import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createYouTubeConnectorToolForUser } from "./youtube-connector-tool";

beforeEach(() => vi.clearAllMocks());

function getTool() {
  return createYouTubeConnectorToolForUser("user-1") as unknown as {
    inputSchema: { safeParse: (value: unknown) => { success: boolean } };
    execute: (input: Record<string, unknown>) => Promise<unknown>;
  };
}

const channels = {
  items: [
    {
      id: "owned-channel",
      snippet: { title: "My Channel", privateData: "discard" },
      contentDetails: {
        relatedPlaylists: { uploads: "uploads-1" },
      },
      brandingSettings: { privateData: "discard" },
    },
  ],
};

describe("YouTube connector tool", () => {
  it("lists only channels returned for the authenticated account", async () => {
    callConnectorApi.mockResolvedValueOnce(channels);
    await expect(
      getTool().execute({ action: "list_channels" }),
    ).resolves.toEqual({
      channels: [
        {
          id: "owned-channel",
          title: "My Channel",
          uploadsPlaylistId: "uploads-1",
        },
      ],
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "youtube",
      "/youtube/v3/channels",
      {
        query: {
          part: "snippet,contentDetails",
          mine: "true",
          maxResults: 50,
        },
        maxResponseBytes: 256 * 1024,
      },
    );
  });

  it("reads bounded uploads only after validating the channel belongs to the account", async () => {
    callConnectorApi.mockResolvedValueOnce(channels).mockResolvedValueOnce({
      items: [
        {
          snippet: {
            title: "Demo",
            description: "A demo",
            publishedAt: "2026-11-16T10:00:00Z",
            resourceId: { videoId: "video-1" },
            thumbnails: { default: { url: "private" } },
          },
          contentDetails: { videoId: "video-1" },
          status: { privacyStatus: "private" },
        },
      ],
      nextPageToken: "next-page",
    });
    await expect(
      getTool().execute({
        action: "list_uploaded_videos",
        channelId: "owned-channel",
        maxResults: 10,
      }),
    ).resolves.toEqual({
      channelId: "owned-channel",
      videos: [
        {
          videoId: "video-1",
          title: "Demo",
          description: "A demo",
          publishedAt: "2026-11-16T10:00:00Z",
        },
      ],
      nextPageToken: "next-page",
    });
    expect(callConnectorApi).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "youtube",
      "/youtube/v3/playlistItems",
      {
        query: {
          part: "snippet,contentDetails",
          playlistId: "uploads-1",
          maxResults: 10,
        },
        maxResponseBytes: 256 * 1024,
      },
    );
  });

  it("refuses a channel not returned by the user's own channel listing", async () => {
    callConnectorApi.mockResolvedValueOnce(channels);
    await expect(
      getTool().execute({
        action: "list_uploaded_videos",
        channelId: "someone-elses-channel",
      }),
    ).resolves.toEqual({
      error: "That channel is not managed by your account",
    });
    expect(callConnectorApi).toHaveBeenCalledTimes(1);
  });

  it("bounds the page size and returns a safe provider error", async () => {
    const tool = getTool();
    expect(
      tool.inputSchema.safeParse({
        action: "list_uploaded_videos",
        maxResults: 51,
      }).success,
    ).toBe(false);
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    await expect(tool.execute({ action: "list_channels" })).resolves.toEqual({
      error: "YouTube data could not be read",
    });
  });
});
