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
    // Database unreachable or migration pending — treat as no access gracefully
  }

  return (
    <div className="flex flex-col lg:flex-row h-full w-full min-h-0 overflow-hidden bg-background">
      <CyberSidebarClient
        userEmail={session.user.email ?? ""}
        userName={session.user.name ?? ""}
        cyberProfile={cyberProfile}
      />
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
