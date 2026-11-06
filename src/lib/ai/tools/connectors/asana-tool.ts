import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { taskCreationApprovalSchema } from "lib/ai/tools/hitl/task-creation-approval";
import { refreshConnectorToken } from "lib/connectors/refresh";
import { pgDb as db } from "lib/db/pg/db.pg";
import { taskCreationApprovalRepository } from "lib/db/pg/repositories/task-creation-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum(["list_workspaces", "list_projects", "list_tasks", "get_task", "create_task"]),
  workspaceGid: z.string().optional(),
  projectGid: z.string().optional(),
  taskGid: z.string().optional(),
  name: z.string().optional().describe("Task name (for create_task)"),
  notes: z.string().optional(),
  approvalToken: z.string().min(40).max(128).optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface AsanaToolInput {
  action: "list_workspaces" | "list_projects" | "list_tasks" | "get_task" | "create_task";
  workspaceGid?: string;
  projectGid?: string;
  taskGid?: string;
  name?: string;
  notes?: string;
  approvalToken?: string;
  limit?: number;
}

const ASANA_API = "https://app.asana.com/api/1.0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "asana"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("asana", rows[0]);
}

export function createAsanaToolForUser(userId: string): Tool {
  return createTool({
    description: `Asana integration tool.

Actions:
- list_workspaces: List accessible Asana workspaces.
- list_projects: List projects in a workspace (requires: workspaceGid).
- list_tasks: List tasks in a project (requires: projectGid).
- get_task: Read a task (requires: taskGid).
- create_task: Create a task only with the exact approvalToken returned by proposeTaskCreation after user review (requires: projectGid, name).

User must connect Asana first via the Connectors menu.`,
    inputSchema,
    execute: async (input: AsanaToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error: "Asana is not connected. Please connect via the Connectors menu.",
          };
        }
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list_workspaces") {
          const res = await fetch(`${ASANA_API}/workspaces?limit=${limit}`, { headers });
          const data = (await res.json()) as { data?: any[] };
          return { workspaces: data.data || [] };
        }
        if (action === "list_projects") {
          if (!input.workspaceGid) return { error: "workspaceGid required" };
          const res = await fetch(
            `${ASANA_API}/projects?workspace=${input.workspaceGid}&limit=${limit}`,
            { headers },
          );
          const data = (await res.json()) as { data?: any[] };
          return { projects: data.data || [] };
        }
        if (action === "list_tasks") {
          if (!input.projectGid) return { error: "projectGid required" };
          const res = await fetch(
            `${ASANA_API}/tasks?project=${input.projectGid}&limit=${limit}`,
            { headers },
          );
          const data = (await res.json()) as { data?: any[] };
          return { tasks: data.data || [] };
        }
        if (action === "get_task") {
          if (!input.taskGid) return { error: "taskGid required" };
          const res = await fetch(`${ASANA_API}/tasks/${input.taskGid}`, { headers });
          return await res.json();
        }
        if (action === "create_task") {
          if (!input.projectGid || !input.name || !input.approvalToken) {
            return { error: "projectGid, name, and approvalToken required" };
          }
          const approval = taskCreationApprovalSchema.safeParse({ provider: "asana", targetId: input.projectGid, name: input.name, details: input.notes ?? "" });
          if (!approval.success || approval.data.provider !== "asana") return { error: "Invalid Asana task approval payload." };
          if (!(await taskCreationApprovalRepository.consume(userId, input.approvalToken, approval.data))) {
            return { error: "Asana task creation requires fresh approval for these exact fields." };
          }
          const res = await fetch(`${ASANA_API}/tasks`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              data: {
                name: approval.data.name,
                notes: approval.data.details,
                projects: [approval.data.targetId],
              },
            }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Asana tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Asana operation failed.",
        };
      }
    },
  });
}

export const asanaTool = createTool({
  description: "Asana tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Asana tool requires user context." }),
});
