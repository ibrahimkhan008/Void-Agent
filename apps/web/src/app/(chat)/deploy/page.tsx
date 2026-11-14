import { getSession } from "auth/server";
import { publishedPageRepository } from "lib/db/repository";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeployDashboard } from "@/components/deploy/deploy-dashboard";

export const metadata: Metadata = {
  title: "Void Deploy",
};

export default async function DeployPage() {
  const session = await getSession().catch(() => null);
  if (!session?.user?.id) redirect("/sign-in");

  const activeOrganizationId = (
    session.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;

  const pages = await publishedPageRepository.selectByOwner(session.user.id);

  return (
    <DeployDashboard
      ownerUserId={session.user.id}
      organizationId={activeOrganizationId ?? undefined}
      initialPages={pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        version: p.version,
        title: p.title,
        viewCount: p.viewCount,
        publishedAt: p.publishedAt.toISOString(),
        revokedAt: p.revokedAt ? p.revokedAt.toISOString() : null,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      }))}
    />
  );
}
