import { OrganizationSettings } from "@/components/organization/organization-settings";
import { getSession } from "lib/auth/server";
import { redirect } from "next/navigation";

export default async function OrganizationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackUrl=%2Forganization%2Fsettings");
  return <OrganizationSettings userId={session.user.id} />;
}
