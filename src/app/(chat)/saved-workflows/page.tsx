import { getSession } from "auth/server";
import { redirect } from "next/navigation";
import SavedWorkflowsPage from "@/components/workflow/saved-workflows-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return <SavedWorkflowsPage />;
}
