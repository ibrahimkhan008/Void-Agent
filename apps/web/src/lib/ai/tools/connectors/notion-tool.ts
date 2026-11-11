import { tool } from "ai";
import { z } from "zod";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("search"),
      query: z.string().max(500).optional(),
      maxResults: z.number().int().min(1).max(20).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("read_page"),
      pageId: z.string().min(1).max(128),
    })
    .strict(),
]);

export function createNotionToolForUser(userId: string) {
  return tool({
    description:
      "Read-only Notion for this signed-in user. Search workspace pages or read a page's bounded text blocks. This tool does not create or modify pages.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "search") {
          const result = await callConnectorApi(
            userId,
            "notion",
            "/v1/search",
            {
              method: "POST",
              body: {
                ...(input.query?.trim() ? { query: input.query.trim() } : {}),
                page_size: input.maxResults,
                sort: {
                  direction: "descending",
                  timestamp: "last_edited_time",
                },
              },
            },
          );
          const results = Array.isArray(result.results)
            ? result.results.slice(0, input.maxResults)
            : [];
          return { pages: results.map((page) => summarizePage(page)) };
        }
        const id = encodeURIComponent(input.pageId);
        const [page, blocks] = await Promise.all([
          callConnectorApi(userId, "notion", `/v1/pages/${id}`, {
            maxResponseBytes: 96 * 1024,
          }),
          callConnectorApi(userId, "notion", `/v1/blocks/${id}/children`, {
            query: { page_size: 50 },
            maxResponseBytes: 384 * 1024,
          }),
        ]);
        const blockList = Array.isArray(blocks.results)
          ? blocks.results.slice(0, 50)
          : [];
        return {
          page: summarizePage(page),
          content: blockList
            .map((block) => blockText(block))
            .filter(Boolean)
            .join("\n")
            .slice(0, 20_000),
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Notion request failed",
        };
      }
    },
  });
}

function summarizePage(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const page = value as Record<string, any>;
  const title = Array.isArray(page.properties)
    ? page.properties
        .flatMap((property: any) => property?.title ?? [])
        .map((item: any) => item?.plain_text)
        .filter(Boolean)
        .join(" ")
    : Object.values(page.properties ?? {})
        .flatMap((property: any) => property?.title ?? [])
        .map((item: any) => item?.plain_text)
        .filter(Boolean)
        .join(" ");
  return {
    id: typeof page.id === "string" ? page.id : undefined,
    title: title.slice(0, 500),
    url: typeof page.url === "string" ? page.url.slice(0, 2048) : undefined,
    lastEditedTime:
      typeof page.last_edited_time === "string"
        ? page.last_edited_time
        : undefined,
  };
}

function blockText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const block = value as Record<string, any>;
  const content = block[block.type];
  const richText = Array.isArray(content?.rich_text) ? content.rich_text : [];
  return richText
    .map((part: any) =>
      typeof part?.plain_text === "string" ? part.plain_text : "",
    )
    .join("")
    .slice(0, 4000);
}
