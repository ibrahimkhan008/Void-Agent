import { tool } from "ai";
import z from "zod";
import { workflowRunApprovalSchema } from "lib/ai/tools/hitl/workflow-run-approval";
import { workflowRunApprovalRepository } from "lib/db/pg/repositories/workflow-run-approval-repository.pg";

const WINDMILL_URL = process.env.WINDMILL_URL || "";
const WINDMILL_TOKEN = process.env.WINDMILL_TOKEN || "";
const WINDMILL_WORKSPACE = process.env.WINDMILL_WORKSPACE || "admins";
const ACTIVEPIECES_URL = process.env.ACTIVEPIECES_URL || "";
const ACTIVEPIECES_TOKEN = process.env.ACTIVEPIECES_TOKEN || "";

const workflowToolSchema = z.object({
    platform: z.enum(["windmill", "activepieces"]),
    action: z
      .enum(["run", "list_flows", "list_scripts"])
      .describe(
        "run executes target with payload; list_flows/list_scripts discovers available automations",
      ),
    target: z
      .string()
      .optional()
      .describe("script path (windmill) or flow id (activepieces)"),
    payload: z
      .record(z.string(), z.any())
      .optional()
      .describe("input parameters for the run"),
    approvalToken: z.string().min(40).max(128).optional().describe("Exact one-use token from the workflow review card; required for run"),
  });

export function createWorkflowToolForUser(userId: string | null) {
  return tool({
    description:
      "Discover configured Windmill scripts or Activepieces flows with list actions. Before any run, use proposeWorkflowRun to show the exact platform, target, and complete JSON payload for user review. Then run only those exact approved values with its one-use approvalToken. Runs without fresh approval are rejected.",
    inputSchema: workflowToolSchema,
    execute: async ({ platform, action, target, payload, approvalToken }) => {
    try {
      if (platform === "windmill") {
        if (!WINDMILL_URL || !WINDMILL_TOKEN)
          return {
            ok: false,
            error: "Windmill not configured on this deployment.",
          };
        const base = `${WINDMILL_URL.replace(/\/$/, "")}/api/w/${WINDMILL_WORKSPACE}`;
        const headers = {
          Authorization: `Bearer ${WINDMILL_TOKEN}`,
          "Content-Type": "application/json",
        };
        if (action === "list_scripts") {
          const r = await fetch(`${base}/scripts/list?page=1&per_page=20`, {
            headers,
          });
          const data = await r.json();
          return {
            ok: r.ok,
            scripts: (Array.isArray(data) ? data : []).map((s: any) => ({
              path: s.path,
              summary: s.summary,
            })),
          };
        }
        if (!target) return { ok: false, error: "target required for run" };
        const approval = workflowRunApprovalSchema.safeParse({ platform, target, payload: payload ?? {} });
        if (!userId || !approvalToken || !approval.success || !(await workflowRunApprovalRepository.consume(userId, approvalToken, approval.data))) {
          return { ok: false, error: "Workflow runs require fresh approval for this exact platform, target, and payload." };
        }
        // p/ = script by path (f/ is for flows); blocking until result
        const r = await fetch(`${base}/jobs/run_wait_result/p/${target}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload ?? {}),
          signal: AbortSignal.timeout(55_000),
        });
        const job = await r.json();
        if (!r.ok)
          return { ok: false, error: job?.message || `HTTP ${r.status}` };
        return { ok: true, platform: "windmill", result: job };
      }

      // activepieces
      if (!ACTIVEPIECES_URL || !ACTIVEPIECES_TOKEN)
        return {
          ok: false,
          error: "Activepieces not configured on this deployment.",
        };
      const abase = `${ACTIVEPIECES_URL.replace(/\/$/, "")}/api/v1`;
      const aheaders = {
        Authorization: `Bearer ${ACTIVEPIECES_TOKEN}`,
        "Content-Type": "application/json",
      };
      if (action === "list_flows") {
        const r = await fetch(`${abase}/flows?limit=20`, { headers: aheaders });
        const data = await r.json();
        return {
          ok: r.ok,
          flows: (data?.data ?? []).map((f: any) => ({
            id: f.id,
            name: f.displayName ?? f.name,
            published: f.published?.version ?? null,
          })),
        };
      }
      if (!target)
        return { ok: false, error: "target (flow id) required for run" };
      const approval = workflowRunApprovalSchema.safeParse({ platform, target, payload: payload ?? {} });
      if (!userId || !approvalToken || !approval.success || !(await workflowRunApprovalRepository.consume(userId, approvalToken, approval.data))) {
        return { ok: false, error: "Workflow runs require fresh approval for this exact platform, target, and payload." };
      }
      const r = await fetch(`${abase}/flow-runs`, {
        method: "POST",
        headers: aheaders,
        body: JSON.stringify({ flowId: target, payload: payload ?? {} }),
      });
      const data = await r.json();
      return { ok: r.ok, platform: "activepieces", data };
    } catch (e: any) {
      return { ok: false, error: e?.message || "workflow tool error" };
    }
    },
  });
}

export const workflowTool = createWorkflowToolForUser(null);
