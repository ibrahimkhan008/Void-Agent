import { CustomizePage } from "@/components/customize/customize-page";
import type { AgentSummary } from "app-types/agent";
import { getSession } from "auth/server";
import { agentRepository, mcpInstallRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

type CustomizeTab =
  | "skills"
  | "connectors"
  | "agents"
  | "instructions"
  | "memory"
  | "notes";

const tabs = new Set<CustomizeTab>([
  "skills",
  "connectors",
  "agents",
  "instructions",
  "memory",
  "notes",
]);

export default async function CustomizeRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.user?.id) return null;

  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = tabs.has(requestedTab as CustomizeTab)
    ? (requestedTab as CustomizeTab)
    : "skills";
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeOrganizationId = (
    session.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;

  let agents: AgentSummary[] = [];
  if (tab === "agents") {
    agents = await agentRepository.selectAgents(
      session.user.id,
      ["mine", "shared"],
      50,
      activeOrganizationId,
    );
  }

  let marketplaceServers: Awaited<
    ReturnType<typeof mcpInstallRepository.listCuratedMcpServers>
  > = [];
  if (tab === "connectors" && view === "marketplace") {
    marketplaceServers = await mcpInstallRepository.listCuratedMcpServers(
      50,
      0,
    );
  }

  return (
    <CustomizePage
      tab={tab}
      view={view === "marketplace" ? "marketplace" : undefined}
      userId={session.user.id}
      userRole={session.user.role}
      agents={agents}
      marketplaceServers={marketplaceServers.map((server) => ({
        id: server.id,
        name: server.name,
        description: server.description ?? null,
        category: server.category ?? null,
        installCount: server.installCount ?? 0,
        homepageUrl: server.homepageUrl ?? null,
        createdAt:
          server.createdAt instanceof Date
            ? server.createdAt.toISOString()
            : server.createdAt,
      }))}
    />
  );
}
