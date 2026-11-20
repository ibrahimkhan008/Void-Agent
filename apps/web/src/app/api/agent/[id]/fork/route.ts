import { withAuth } from "auth/route-guard";
import { canCreateAgent } from "lib/auth/permissions";
import { agentInstallRepository, agentRepository } from "lib/db/repository";
import logger from "lib/logger";

/**
 * POST /api/agent/[id]/fork — GitHub-style fork: copy an agent the caller
 * can read into their own account as a private, fully editable row.
 *
 * Read paths, widest last: the caller's own agent (forking your own agent is
 * a duplicate, like GitHub), an org-shared public/readonly agent within the
 * caller's active org, or an agent published to the public gallery (any
 * org). Anything else 404s — the fork endpoint must never widen reads.
 *
 * The fork copies name/description/icon/model and instructions
 * (role, system prompt, tool mentions, knowledge bases) but drops the
 * source's file bindings: those are read grants against the author's storage
 * keys, and a fork is a new agent owned by the forker.
 */
export const POST = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const hasPermission = await canCreateAgent();
    if (!hasPermission) {
      return Response.json(
        { error: "You don't have permission to create agents" },
        { status: 403 },
      );
    }

    try {
      const { id } = await params;
      const activeOrganizationId = (
        session.session as { activeOrganizationId?: string | null } | undefined
      )?.activeOrganizationId;

      const source =
        (await agentRepository.selectAgentById(
          id,
          session.user.id,
          activeOrganizationId,
        )) ??
        (await agentInstallRepository.getPublishedAgent(id).then((agent) =>
          agent
            ? {
                ...agent,
                instructions: agent.instructions ?? {},
                description: agent.description ?? undefined,
                icon: agent.icon ?? undefined,
                presetId: agent.presetId ?? null,
                // The published-browse read is owner-free by design, so the
                // author's display name is not part of it — the snapshot
                // records the source name only.
                userName: null,
                isBookmarked: false,
              }
            : null,
        ));
      if (!source) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }

      const fork = await agentRepository.insertAgent({
        name: source.name,
        description: source.description,
        icon: source.icon,
        userId: session.user.id,
        organizationId: activeOrganizationId ?? null,
        instructions: {
          ...source.instructions,
          // Foreign file bindings are grants against the author's storage —
          // never carried into the forker's copy.
          files: undefined,
        },
        visibility: "private",
        model: source.model ?? null,
        forkedFromAgentId: source.id,
        galleryMetadata: {
          forkedFrom: {
            agentId: source.id,
            name: source.name,
            userName: source.userName ?? null,
          },
        },
      });

      // A counter must never block (or fail) the fork it is counting.
      void agentRepository
        .incrementAgentForkCount(source.id)
        .catch((error) =>
          logger.error("[agent-fork] fork count increment failed", error),
        );

      return Response.json({ agent: fork }, { status: 201 });
    } catch (error) {
      console.error("Failed to fork agent:", error);
      return Response.json({ error: "Failed to fork agent" }, { status: 500 });
    }
  },
);
