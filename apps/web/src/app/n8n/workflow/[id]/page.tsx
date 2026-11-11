import N8nWorkflowEmbed from "@/components/workflow/n8n-workflow-embed";
import { getSession } from "auth/server";
import { N8nError, createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import { toN8nWorkflowReadOnlySummary } from "lib/n8n/workflow-summary";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function N8nWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in");
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) notFound();

  try {
    const n8nUser = await ensureN8nUser(session);
    const workflow = await createUserClient(
      n8nUser.email ?? session.user.email ?? "",
      n8nUser.password ?? "",
    ).getWorkflowDefinition(id);
    return (
      <N8nWorkflowEmbed workflow={toN8nWorkflowReadOnlySummary(workflow)} />
    );
  } catch (error) {
    if (error instanceof N8nError && error.status === 401) redirect("/sign-in");
    if (error instanceof N8nError && error.status === 404) notFound();
    notFound();
  }
}
