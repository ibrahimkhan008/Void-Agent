import {
  AgentsList,
  type CyberAgentSummary,
} from "@/components/agent/agents-list";
import { getSession } from "auth/server";
import { getOrBootstrapCyberProfile } from "lib/cyber/auth";
import { FINDING_SCRIBE_AGENT_ID } from "lib/cyber/self-learning-utils";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { agentRepository } from "lib/db/repository";
import { notFound } from "next/navigation";

// Force dynamic rendering to avoid static generation issues with session
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getSession();

  if (!session?.user.id) {
    notFound();
  }

  const activeOrganizationId = (
    session.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;

  // Fetch normal Void Agent agents, Cyber profile, and Cyber predefined agents
  const [allAgents, cyberProfile, cyberAgents] = await Promise.all([
    agentRepository.selectAgents(
      session.user.id,
      ["mine", "shared"],
      50,
      activeOrganizationId,
    ),
    getOrBootstrapCyberProfile(session).catch(() => null),
    cyberRepository.listAgentsForUser(session.user.id).catch(() => []),
  ]);

  // Separate into my agents and shared agents
  const myAgents = allAgents.filter(
    (agent) => agent.userId === session.user.id,
  );
  const sharedAgents = allAgents.filter(
    (agent) => agent.userId !== session.user.id,
  );

  const hasActiveCyberAccess =
    Boolean(cyberProfile) && cyberProfile?.status === "active";
  const isCyberAdmin = (cyberProfile?.accessTier ?? 0) >= 3;

  const builtinCyberAgents: CyberAgentSummary[] = hasActiveCyberAccess
    ? [
        {
          id: "builtin:void-cyber-auto",
          userId: "system",
          name: "Void Cyber (Auto)",
          description:
            "Default self-improving Void Cyber bug bounty & security audit agent with automatic skill hooking.",
          isShared: true,
          isBuiltin: true,
          openHref: "/cyber",
          editHref: isCyberAdmin ? "/cyber/admin/users?tab=agents" : null,
        },
        {
          id: FINDING_SCRIBE_AGENT_ID,
          userId: "system",
          name: "Finding Scribe (Bug Logger)",
          description:
            "Dedicated default bug logger that structures CVSS/CWE/PoC findings and saves them straight to Recent Findings.",
          isShared: true,
          isBuiltin: true,
          openHref: `/cyber?agentId=${encodeURIComponent(FINDING_SCRIBE_AGENT_ID)}`,
          editHref: isCyberAdmin ? "/cyber/admin/users?tab=agents" : null,
        },
      ]
    : [];

  const customCyberAgents: CyberAgentSummary[] = cyberAgents.map((a) => ({
    id: a.id,
    userId: a.userId,
    name: a.name,
    description: a.description ?? null,
    isShared: Boolean(a.isShared),
    isBuiltin: false,
    openHref: `/cyber?agentId=${encodeURIComponent(a.id)}`,
    editHref: a.userId === session.user.id ? "/cyber/agents" : null,
  }));

  const initialCyberAgents: CyberAgentSummary[] = [
    ...builtinCyberAgents,
    ...customCyberAgents,
  ];

  return (
    <AgentsList
      initialMyAgents={myAgents}
      initialSharedAgents={sharedAgents}
      initialCyberAgents={initialCyberAgents}
      userId={session.user.id}
      userRole={session.user.role}
    />
  );
}
