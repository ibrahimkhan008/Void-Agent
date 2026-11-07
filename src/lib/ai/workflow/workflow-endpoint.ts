export function getWorkflowStructureEndpoint(
  workflowId: string,
  savedDraftMode: boolean,
) {
  const collection = savedDraftMode ? "/api/saved-workflows" : "/api/workflow";
  return `${collection}/${encodeURIComponent(workflowId)}/structure`;
}
