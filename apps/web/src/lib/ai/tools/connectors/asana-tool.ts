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
      action: z.literal("list_workspaces"),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_projects"),
      workspaceGid: z.string().min(1).max(128),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_tasks"),
      projectGid: z.string().min(1).max(128),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_task"),
      taskGid: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_task"),
      projectGid: z.string().min(1).max(128),
      name: z.string().min(1).max(500),
      notes: z.string().max(20_000).optional(),
      approvalToken,
    })
    .strict(),
]);

export function createAsanaToolForUser(userId: string) {
  return tool({
    description:
      "Asana for this signed-in user. List workspaces/projects/tasks or read a task. Creating a task requires first proposing the exact projectGid/name/notes with proposeConnectorAction and then the user approving it; execute only with the matching one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_workspaces") {
          const result = await callConnectorApi(
            userId,
            "asana",
            "/api/1.0/workspaces",
            { query: { limit: input.limit } },
          );
          return { workspaces: boundedArray(result.data, input.limit) };
        }
        if (input.action === "list_projects") {
          const result = await callConnectorApi(
            userId,
            "asana",
            "/api/1.0/projects",
            {
              query: { workspace: input.workspaceGid, limit: input.limit },
            },
          );
          return { projects: boundedArray(result.data, input.limit) };
        }
        if (input.action === "list_tasks") {
          const result = await callConnectorApi(
            userId,
            "asana",
            "/api/1.0/tasks",
            {
              query: { project: input.projectGid, limit: input.limit },
            },
          );
          return { tasks: boundedArray(result.data, input.limit) };
        }
        if (input.action === "get_task") {
          return await callConnectorApi(
            userId,
            "asana",
            `/api/1.0/tasks/${encodeURIComponent(input.taskGid)}`,
          );
        }
        const payload = {
          projectGid: input.projectGid,
          name: input.name,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "asana",
            action: "create_task",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Asana action has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "asana",
          "/api/1.0/tasks",
          {
            method: "POST",
            body: {
              data: {
                name: input.name,
                ...(input.notes !== undefined ? { notes: input.notes } : {}),
                projects: [input.projectGid],
              },
            },
          },
        );
        return { success: true, task: result.data ?? result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Asana action failed",
        };
      }
    },
  });
}

function boundedArray(value: unknown, limit: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
