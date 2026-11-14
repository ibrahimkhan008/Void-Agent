import { VoidHooksDashboard } from "@/components/webhooks/void-hooks-dashboard";
import { WebhooksDashboard } from "@/components/webhooks/webhooks-dashboard";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session?.user) {
    return redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <VoidHooksDashboard />
      <WebhooksDashboard />
    </div>
  );
}
