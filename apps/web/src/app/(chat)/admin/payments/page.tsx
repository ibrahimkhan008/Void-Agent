import { DodoPaymentsSettings } from "@/components/admin/dodo-payments-settings";
import { getSession } from "auth/server";
import { hasAdminPermission } from "lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!(await hasAdminPermission())) redirect("/");
  return <DodoPaymentsSettings />;
}
