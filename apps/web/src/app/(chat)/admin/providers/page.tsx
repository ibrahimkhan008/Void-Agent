import { DynamicProvidersSettings } from "@/components/admin/dynamic-providers-settings";
import { getSession } from "auth/server";
import { hasAdminPermission } from "lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!(await hasAdminPermission())) redirect("/");
  return <DynamicProvidersSettings />;
}
