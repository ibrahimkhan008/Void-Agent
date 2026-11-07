export async function updateSavedWorkflowMetadata(
  workflowId: string,
  payload: { name: string; description?: string },
  request: typeof fetch = fetch,
) {
  const response = await request(
    `/api/saved-workflows/${encodeURIComponent(workflowId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error("Unable to save workflow");
  return response.json();
}
