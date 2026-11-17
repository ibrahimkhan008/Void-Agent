import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum(["list_channels", "list_uploaded_videos"]),
  channelId: z.string().trim().min(1).max(128).optional(),
  maxResults: z.number().int().min(1).max(50).default(20),
  pageToken: z.string().trim().min(1).max(2_000).optional(),
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

export function createYouTubeConnectorToolForUser(userId: string) {
  return tool<z.infer<typeof inputSchema>, unknown, never>({
    description:
      "List YouTube channels managed by your connected Google account and read their uploaded videos. Read-only; it cannot upload, edit, delete, like, or comment. A channelId must belong to your account.",
    inputSchema,
    execute: async ({ action, channelId, maxResults, pageToken }) => {
      try {
        const channelsResult = await callConnectorApi(
          userId,
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
        const sourceChannels = Array.isArray(channelsResult.items)
          ? channelsResult.items
          : [];
        const channels = sourceChannels.flatMap((value) => {
          const item = record(value);
          const contentDetails = record(item.contentDetails);
          const relatedPlaylists = record(contentDetails.relatedPlaylists);
          const snippet = record(item.snippet);
          const id = stringValue(item.id, 128);
          if (!id) return [];
          return [
            {
              id,
              ...(stringValue(snippet.title, 300)
                ? { title: stringValue(snippet.title, 300) }
                : {}),
              ...(stringValue(relatedPlaylists.uploads, 128)
                ? {
                    uploadsPlaylistId: stringValue(
                      relatedPlaylists.uploads,
                      128,
                    ),
                  }
                : {}),
            },
          ];
        });

        if (action === "list_channels") {
          return { channels: channels.slice(0, 50) };
        }

        const channel = channelId
          ? channels.find((candidate) => candidate.id === channelId)
          : channels[0];
        if (channelId && !channel) {
          return { error: "That channel is not managed by your account" };
        }
        if (!channel?.uploadsPlaylistId) {
          return {
            channelId: channel?.id,
            videos: [],
            ...(channel ? {} : { message: "No managed YouTube channel found" }),
          };
        }

        const videosResult = await callConnectorApi(
          userId,
          "youtube",
          "/youtube/v3/playlistItems",
          {
            query: {
              part: "snippet,contentDetails",
              playlistId: channel.uploadsPlaylistId,
              maxResults: maxResults ?? 20,
              ...(pageToken ? { pageToken } : {}),
            },
            maxResponseBytes: 256 * 1024,
          },
        );
        const videos = (
          Array.isArray(videosResult.items) ? videosResult.items : []
        )
          .slice(0, maxResults ?? 20)
          .flatMap((value) => {
            const item = record(value);
            const snippet = record(item.snippet);
            const contentDetails = record(item.contentDetails);
            const resourceId = record(snippet.resourceId);
            const videoId =
              stringValue(contentDetails.videoId, 128) ??
              stringValue(resourceId.videoId, 128);
            if (!videoId) return [];
            return [
              {
                videoId,
                ...(stringValue(snippet.title, 500)
                  ? { title: stringValue(snippet.title, 500) }
                  : {}),
                ...(stringValue(snippet.description, 2_000)
                  ? { description: stringValue(snippet.description, 2_000) }
                  : {}),
                ...(stringValue(contentDetails.videoPublishedAt, 64)
                  ? {
                      publishedAt: stringValue(
                        contentDetails.videoPublishedAt,
                        64,
                      ),
                    }
                  : stringValue(snippet.publishedAt, 64)
                    ? { publishedAt: stringValue(snippet.publishedAt, 64) }
                    : {}),
              },
            ];
          });
        return {
          channelId: channel.id,
          videos,
          ...(typeof videosResult.nextPageToken === "string"
            ? { nextPageToken: videosResult.nextPageToken.slice(0, 2_000) }
            : {}),
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "YouTube data could not be read",
        };
      }
    },
  });
}
