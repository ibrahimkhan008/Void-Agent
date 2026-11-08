import { AgentPresets } from "@/components/agent-presets";
import { getSession } from "auth/server";
import { canCreateAgent } from "lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AgentPresetsPage() {
  const session = await getSession();
  if (!session?.user.id) redirect("/login?next=%2Fagents%2Fpresets");
  if (!(await canCreateAgent())) redirect("/agents");
  return <AgentPresets />;
}
