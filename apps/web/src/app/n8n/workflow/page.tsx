import { N8nWorkflowList } from "@/components/workflow/n8n-workflow-list";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function N8nWorkflowIndexPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in");
  return <N8nWorkflowList />;
}
