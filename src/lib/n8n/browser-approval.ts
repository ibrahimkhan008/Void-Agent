export type N8nWorkflowReview = {
  workflowName: string;
  graphRevision: string;
  effects: string[];
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: unknown })
    | null;
  if (!response.ok || !body) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Workflow request failed (${response.status})`,
    );
  }
  return body;
}

export async function previewN8nWorkflow(
  id: string,
): Promise<N8nWorkflowReview> {
  const response = await fetch("/api/approvals/workflow-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previewN8nWorkflowId: id }),
  });
  const review = await readJson<N8nWorkflowReview>(response);
  if (
    typeof review.workflowName !== "string" ||
    typeof review.graphRevision !== "string" ||
    !Array.isArray(review.effects) ||
    !review.effects.every((effect) => typeof effect === "string")
  ) {
    throw new Error("Workflow review response is invalid");
  }
  return review;
}

export async function executeReviewedN8nWorkflow(input: {
  id: string;
  review: N8nWorkflowReview;
  query: Record<string, unknown>;
}): Promise<unknown> {
  const approvalResponse = await fetch("/api/approvals/workflow-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: "n8n",
      target: input.id,
      workflowName: input.review.workflowName,
      graphRevision: input.review.graphRevision,
      payload: input.query,
    }),
  });
  const approval = await readJson<{ approvalToken?: unknown }>(
    approvalResponse,
  );
  if (typeof approval.approvalToken !== "string")
    throw new Error("Workflow approval response is invalid");
  const executeResponse = await fetch(
    `/api/workflow/${encodeURIComponent(input.id)}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        workflowName: input.review.workflowName,
        graphRevision: input.review.graphRevision,
        approvalToken: approval.approvalToken,
      }),
    },
  );
  return readJson<unknown>(executeResponse);
}
