import { AcceptOrganizationInvitation } from "@/components/organization/accept-invitation";
import { getSession } from "lib/auth/server";
import { redirect } from "next/navigation";

export default async function AcceptInvitationPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    redirect(
      `/sign-in?callbackUrl=${encodeURIComponent(`/accept-invitation/${id}`)}`,
    );
  return <AcceptOrganizationInvitation invitationId={id} />;
}
