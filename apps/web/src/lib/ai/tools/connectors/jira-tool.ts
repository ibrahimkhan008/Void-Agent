import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { z } from "zod";

const approvalToken = z.string().min(43).max(43);
const cloudId = z.string().uuid();
const issueKey = z.string().regex(/^[A-Z][A-Z0-9_]{0,29}-[1-9][0-9]{0,9}$/);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_projects"),
      cloudId,
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("search_issues"),
      cloudId,
      projectKey: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,29}$/)
        .optional(),
      jql: z.string().max(2000).optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z.object({ action: z.literal("get_issue"), cloudId, issueKey }).strict(),
  z
    .object({
      action: z.literal("add_comment"),
      cloudId,
      issueKey,
      comment: z.string().min(1).max(20_000),
      approvalToken,
    })
    .strict(),
]);

const apiPath = (id: string, suffix: string) =>
  `/ex/jira/${id}/rest/api/3${suffix}`;

export function createJiraToolForUser(userId: string) {
  return tool({
    description:
      "Jira for the signed-in user. Read projects/issues with a cloudId. Adding a comment requires proposing the exact cloudId/issueKey/comment and user approval, then a matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_projects") {
          const result = await callConnectorApi(
            userId,
            "jira",
            apiPath(input.cloudId, "/project/search"),
            { query: { maxResults: input.limit } },
          );
          return { projects: sliceArray(result.values, input.limit) };
        }
        if (input.action === "search_issues") {
          const jql =
            input.jql ??
            (input.projectKey
              ? `project = "${input.projectKey}" ORDER BY created DESC`
              : "ORDER BY created DESC");
          const result = await callConnectorApi(
            userId,
            "jira",
            apiPath(input.cloudId, "/search"),
            { query: { jql, maxResults: input.limit } },
          );
          return { issues: sliceArray(result.issues, input.limit) };
        }
        if (input.action === "get_issue") {
          return await callConnectorApi(
            userId,
            "jira",
            apiPath(
              input.cloudId,
              `/issue/${encodeURIComponent(input.issueKey)}`,
            ),
          );
        }
        const payload = {
          cloudId: input.cloudId,
          issueKey: input.issueKey,
          comment: input.comment,
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          { provider: "jira", action: "add_comment", payload },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Jira comment has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "jira",
          apiPath(
            input.cloudId,
            `/issue/${encodeURIComponent(input.issueKey)}/comment`,
          ),
          {
            method: "POST",
            body: {
              body: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: input.comment }],
                  },
                ],
              },
            },
          },
        );
        return { success: true, comment: result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Jira action failed",
        };
      }
    },
  });
}

function sliceArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
