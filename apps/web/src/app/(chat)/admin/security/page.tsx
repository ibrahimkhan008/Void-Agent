import { SecurityEventsSettings } from "@/components/admin/security-events-settings";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getSession } from "auth/server";
import { hasAdminPermission } from "lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!(await hasAdminPermission())) redirect("/");

  return (
    <main className="container mx-auto space-y-6 p-6">
      <header className="space-y-2">
        <Eyebrow>Admin</Eyebrow>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance">
          Security settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure the lookback used for account sign-in device and location
          comparisons.
        </p>
      </header>
      <SecurityEventsSettings />
    </main>
  );
}
