import { TeamInvitationAcceptance } from "@/components/team-invitation-acceptance";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Accept team invitation - Void-Agent",
  robots: { index: false, follow: false },
};

export default function AcceptTeamInvitationPage() {
  return <TeamInvitationAcceptance />;
}
