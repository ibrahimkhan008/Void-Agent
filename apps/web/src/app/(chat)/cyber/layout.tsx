import { CyberAccessLocked } from "@/components/cyber/cyber-access-locked";
import { getSession } from "lib/auth/server";
import { getOrBootstrapCyberProfile } from "lib/cyber/auth";
import { redirect } from "next/navigation";
import { CyberSidebarClient } from "./cyber-sidebar-client";

export const dynamic = "force-dynamic";

export default async function CyberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  let cyberProfile: {
    accessTier: number;
    role: string;
    status: string;
    voidTrustScore: number;
  } | null = null;
  let lookupFailed = false;

  try {
    const profile = await getOrBootstrapCyberProfile(session);
    if (profile) {
      cyberProfile = {
        accessTier: profile.accessTier,
        role: profile.role,
        status: profile.status,
        voidTrustScore: profile.voidTrustScore,
      };
    }
  } catch {
    lookupFailed = true;
  }

  // Every /cyber route is gated here so sub-pages never render empty panels
  // (and a nav full of locked links) for users without an active profile.
  if (!cyberProfile || cyberProfile.status !== "active") {
    return (
      <div className="h-full w-full min-h-0 overflow-y-auto bg-background">
        <CyberAccessLocked
          reason={
            lookupFailed ? "unavailable" : cyberProfile ? "inactive" : "none"
          }
          email={session.user.email}
          status={cyberProfile?.status}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full w-full min-h-0 overflow-hidden bg-background">
      <CyberSidebarClient cyberProfile={cyberProfile} />
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
