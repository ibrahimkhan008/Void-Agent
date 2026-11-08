import { ActiveTeamSelector } from "@/components/active-team-selector";
import { TeamMembersSettings } from "@/components/team-members-settings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team members - Void-Agent",
  description: "Manage access to Void-Agent teams.",
};

export default function TeamMembersPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-4xl px-5 pt-8 md:px-8">
        <ActiveTeamSelector />
      </div>
      <TeamMembersSettings />
    </>
  );
}
