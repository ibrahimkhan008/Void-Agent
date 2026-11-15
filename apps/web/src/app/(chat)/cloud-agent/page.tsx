import { HomeChat } from "@/components/home-chat";
import { logBootServerRender } from "@/lib/boot-diagnostics/server";

// Keep the Agent destination visually aligned with the main dashboard while
// its dedicated functionality is being defined.
export const dynamic = "force-dynamic";

export default async function CloudAgentPage() {
  await logBootServerRender("/cloud-agent");
  return <HomeChat />;
}
