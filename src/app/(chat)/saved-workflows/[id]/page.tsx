import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";
import { convertDBEdgeToUIEdge, convertDBNodeToUINode } from "lib/ai/workflow/shared.workflow";
import Workflow from "@/components/workflow/workflow";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SavedWorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) notFound();
  const workflow = await workflowRepository.selectStructureById(id);
  if (!workflow || workflow.userId !== session.user.id || workflow.isPublished) notFound();
  return (
    <div className="h-full min-h-[600px] w-full">
      <Workflow
        workflowId={id}
        hasEditAccess
        savedDraftMode
        initialNodes={workflow.nodes.map(convertDBNodeToUINode)}
        initialEdges={workflow.edges.map(convertDBEdgeToUIEdge)}
      />
    </div>
  );
}
