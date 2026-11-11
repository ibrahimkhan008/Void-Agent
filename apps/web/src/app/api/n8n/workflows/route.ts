import { withAuth } from "auth/route-guard";
import { N8nError, createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import { toN8nWorkflowListSummary } from "lib/n8n/workflow-summary";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session) => {
  let rate;
  try {
    rate = await checkApiRateLimit({
      kind: "n8n-workflow-list",
      id: session.user.id,
      limit: 60,
      windowMs: 60_000,
    });
  } catch {
    return Response.json(
      { error: "Workflow service is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!rate.allowed)
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );

  try {
    const n8nUser = await ensureN8nUser(session);
    const workflows = await createUserClient(
      n8nUser.email ?? session.user.email ?? "",
      n8nUser.password ?? "",
    ).listWorkflows();
    return Response.json(
      { workflows: workflows.map(toN8nWorkflowListSummary) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof N8nError && error.status === 401 ? 401 : 502;
    return Response.json(
      { error: "Could not load n8n workflows" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
});
