import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const projectId = z.string().regex(/^[1-9][0-9]{0,18}$/u);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_projects"),
      limit: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_issues"),
      projectId,
      state: z.enum(["opened", "closed", "all"]).optional().default("opened"),
      limit: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_merge_requests"),
      projectId,
      state: z
        .enum(["opened", "closed", "merged", "all"])
        .optional()
        .default("opened"),
      limit: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
]);

/** Read-only access to projects, issues, and merge requests visible to the user. */
export function createGitLabToolForUser(userId: string) {
  return tool({
    description:
      "Read-only GitLab.com access for this signed-in user. List projects, issues, and merge requests. Project actions require a numeric GitLab project ID from the project list. This tool cannot create or modify GitLab data.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_projects") {
          const result = await callConnectorApi(
            userId,
            "gitlab",
            "/api/v4/projects",
            {
              query: {
                membership: "true",
                order_by: "last_activity_at",
                sort: "desc",
                per_page: input.limit,
              },
              maxResponseBytes: 256 * 1024,
            },
          );
          return {
            projects: projectSummaries(result.items, input.limit),
          };
        }

        const state = input.state === "all" ? undefined : input.state;
        const result = await callConnectorApi(
          userId,
          "gitlab",
          `/api/v4/projects/${input.projectId}/${input.action === "list_issues" ? "issues" : "merge_requests"}`,
          {
            query: {
              ...(state ? { state } : {}),
              order_by: "updated_at",
              sort: "desc",
              per_page: input.limit,
            },
            maxResponseBytes: 256 * 1024,
          },
        );
        return {
          [input.action === "list_issues" ? "issues" : "mergeRequests"]:
            workItemSummaries(result.items, input.limit),
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "GitLab request failed",
        };
      }
    },
  });
}

function projectSummaries(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const project = item as Record<string, unknown>;
    if (typeof project.id !== "number" || typeof project.name !== "string")
      return [];
    return [
      {
        id: project.id,
        name: project.name.slice(0, 300),
        pathWithNamespace:
          typeof project.path_with_namespace === "string"
            ? project.path_with_namespace.slice(0, 500)
            : undefined,
        webUrl:
          typeof project.web_url === "string"
            ? safeGitLabUrl(project.web_url)
            : undefined,
        description:
          typeof project.description === "string"
            ? project.description.slice(0, 2_000)
            : undefined,
        lastActivityAt:
          typeof project.last_activity_at === "string"
            ? project.last_activity_at.slice(0, 40)
            : undefined,
      },
    ];
  });
}

function workItemSummaries(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const workItem = item as Record<string, unknown>;
    if (typeof workItem.iid !== "number" || typeof workItem.title !== "string")
      return [];
    return [
      {
        iid: workItem.iid,
        title: workItem.title.slice(0, 500),
        state: typeof workItem.state === "string" ? workItem.state : undefined,
        webUrl:
          typeof workItem.web_url === "string"
            ? safeGitLabUrl(workItem.web_url)
            : undefined,
        updatedAt:
          typeof workItem.updated_at === "string"
            ? workItem.updated_at.slice(0, 40)
            : undefined,
        labels: Array.isArray(workItem.labels)
          ? workItem.labels
              .filter((label): label is string => typeof label === "string")
              .slice(0, 20)
              .map((label) => label.slice(0, 100))
          : [],
      },
    ];
  });
}

function safeGitLabUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.origin === "https://gitlab.com" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
