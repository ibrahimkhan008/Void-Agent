import { tool } from "ai";
import { z } from "zod";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const repository = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_repos"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_issues"),
      repository,
      state: z.enum(["open", "closed", "all"]).optional().default("open"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_issue"),
      repository,
      issueNumber: z.number().int().min(1).max(2_147_483_647),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_prs"),
      repository,
      state: z.enum(["open", "closed", "all"]).optional().default("open"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
]);

export function createGitHubToolForUser(userId: string) {
  return tool({
    description:
      "Read-only GitHub for this signed-in user. List repositories, issues, one issue, or pull requests. This tool cannot create or modify repositories, issues, or pull requests.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "list_repos") {
          const result = await callConnectorApi(
            userId,
            "github",
            "/user/repos",
            {
              query: {
                per_page: input.maxResults,
                sort: "updated",
                direction: "desc",
              },
            },
          );
          return {
            repositories: Array.isArray(result.items)
              ? result.items.slice(0, input.maxResults)
              : [],
          };
        }
        const [owner, repo] = input.repository.split("/");
        const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        if (input.action === "get_issue") {
          return await callConnectorApi(
            userId,
            "github",
            `${base}/issues/${input.issueNumber}`,
          );
        }
        const path =
          input.action === "list_issues" ? `${base}/issues` : `${base}/pulls`;
        const result = await callConnectorApi(userId, "github", path, {
          query: {
            state: input.state,
            per_page: input.maxResults,
            sort: "updated",
            direction: "desc",
          },
        });
        return {
          [input.action === "list_issues" ? "issues" : "pullRequests"]:
            Array.isArray(result.items)
              ? result.items.slice(0, input.maxResults)
              : [],
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "GitHub request failed",
        };
      }
    },
  });
}
