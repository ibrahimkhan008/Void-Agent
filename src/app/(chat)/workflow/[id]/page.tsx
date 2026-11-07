import N8nWorkflowEmbed from "@/components/workflow/n8n-workflow-embed";
import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import { toN8nWorkflowReadOnlySummary } from "lib/n8n/workflow-summary";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  let workflow;
  try {
    const n8nUser = await ensureN8nUser(session);
    workflow = await createUserClient(
      n8nUser.email ?? session.user.email ?? "",
      n8nUser.password ?? "",
    ).getWorkflowDefinition(id);
  } catch {
    notFound();
  }

  return <N8nWorkflowEmbed workflow={toN8nWorkflowReadOnlySummary(workflow)} />;
}
