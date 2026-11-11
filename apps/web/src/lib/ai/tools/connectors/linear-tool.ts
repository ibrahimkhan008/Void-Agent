import { tool } from "ai";
import { z } from "zod";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const approvalToken = z.string().min(43).max(43);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_teams"),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_issues"),
      teamId: z.string().min(1).max(128),
      state: z.string().max(128).optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_issue"),
      issueId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_issue"),
      teamId: z.string().min(1).max(128),
      title: z.string().min(1).max(500),
      description: z.string().max(20_000).optional(),
      approvalToken,
    })
    .strict(),
]);

const GQL = "/graphql";

export function createLinearToolForUser(userId: string) {
  return tool({
    description:
      "Linear for this signed-in user. List teams/issues or read an issue. Creating an issue requires first proposing the exact teamId/title/description with proposeConnectorAction and then user approval; execute only with the matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_teams") {
          const result = await graph(
            userId,
            "query Teams($first: Int!) { teams(first: $first) { nodes { id name key } } }",
            { first: input.limit },
          );
          return { teams: nestedArray(result, "teams") };
        }
        if (input.action === "list_issues") {
          const query = input.state
            ? "query Issues($first: Int!, $teamId: String!, $state: String!) { issues(first: $first, filter: { team: { id: { eq: $teamId } }, state: { name: { eq: $state } } }) { nodes { id identifier title state { name } } } }"
            : "query Issues($first: Int!, $teamId: String!) { issues(first: $first, filter: { team: { id: { eq: $teamId } } }) { nodes { id identifier title state { name } } } }";
          const variables = {
            first: input.limit,
            teamId: input.teamId,
            ...(input.state ? { state: input.state } : {}),
          };
          const result = await graph(userId, query, variables);
          return { issues: nestedArray(result, "issues") };
        }
        if (input.action === "get_issue") {
          const result = await graph(
            userId,
            "query Issue($id: String!) { issue(id: $id) { id identifier title description state { name } assignee { name email } } }",
            { id: input.issueId },
          );
          return { issue: nestedObject(result, "issue") };
        }
        const payload = {
          teamId: input.teamId,
          title: input.title,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "linear",
            action: "create_issue",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Linear action has not been approved or its approval expired",
          );
        const result = await graph(
          userId,
          "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }",
          {
            input: {
              teamId: input.teamId,
              title: input.title,
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
            },
          },
        );
        return { success: true, result: nestedObject(result, "issueCreate") };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Linear action failed",
        };
      }
    },
  });
}

async function graph(
  userId: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const result = await callConnectorApi(userId, "linear", GQL, {
    method: "POST",
    body: { query, variables },
    maxResponseBytes: 256 * 1024,
  });
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    throw new ConnectorApiError("Linear could not complete this request");
  }
  return result;
}

function nestedObject(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const data = value.data;
  if (!data || typeof data !== "object") return undefined;
  const child = (data as Record<string, unknown>)[key];
  return child && typeof child === "object"
    ? (child as Record<string, unknown>)
    : undefined;
}

function nestedArray(value: Record<string, unknown>, key: string): unknown[] {
  const child = nestedObject(value, key);
  return Array.isArray(child?.nodes) ? child.nodes : [];
}
