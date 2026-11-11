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
      action: z.literal("list_spaces"),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_lists"),
      spaceId: z.string().min(1).max(128),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_tasks"),
      listId: z.string().min(1).max(128),
      status: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_task"),
      taskId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_task"),
      listId: z.string().min(1).max(128),
      name: z.string().min(1).max(500),
      description: z.string().max(20_000).optional(),
      approvalToken,
    })
    .strict(),
]);

export function createClickUpToolForUser(userId: string) {
  return tool({
    description:
      "ClickUp for this signed-in user. List spaces/lists/tasks or read a task. Creating a task requires first proposing the exact listId/name/description with proposeConnectorAction and then user approval; execute only with the matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_spaces") {
          const teams = await callConnectorApi(
            userId,
            "clickup",
            "/api/v2/team",
          );
          const team = firstRecord(teams.teams);
          if (
            !team ||
            (typeof team.id !== "string" && typeof team.id !== "number")
          )
            return { spaces: [] };
          const result = await callConnectorApi(
            userId,
            "clickup",
            `/api/v2/team/${encodeURIComponent(String(team.id))}/space`,
            {
              query: { archived: "false" },
            },
          );
          return { spaces: boundedArray(result.spaces, input.limit) };
        }
        if (input.action === "list_lists") {
          const result = await callConnectorApi(
            userId,
            "clickup",
            `/api/v2/space/${encodeURIComponent(input.spaceId)}/list`,
            {
              query: { archived: "false" },
            },
          );
          return { lists: boundedArray(result.lists, input.limit) };
        }
        if (input.action === "list_tasks") {
          const result = await callConnectorApi(
            userId,
            "clickup",
            `/api/v2/list/${encodeURIComponent(input.listId)}/task`,
            {
              query: {
                archived: "false",
                ...(input.status ? { "statuses[]": input.status } : {}),
              },
            },
          );
          return { tasks: boundedArray(result.tasks, input.limit) };
        }
        if (input.action === "get_task") {
          return await callConnectorApi(
            userId,
            "clickup",
            `/api/v2/task/${encodeURIComponent(input.taskId)}`,
          );
        }
        const payload = {
          listId: input.listId,
          name: input.name,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "clickup",
            action: "create_task",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact ClickUp action has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "clickup",
          `/api/v2/list/${encodeURIComponent(input.listId)}/task`,
          {
            method: "POST",
            body: {
              name: input.name,
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
            },
          },
        );
        return { success: true, task: result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "ClickUp action failed",
        };
      }
    },
  });
}

function boundedArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  const first = Array.isArray(value) ? value[0] : undefined;
  return first && typeof first === "object"
    ? (first as Record<string, unknown>)
    : undefined;
}
