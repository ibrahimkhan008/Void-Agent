import { withAuth } from "auth/route-guard";
import { agentInstallRepository } from "lib/db/repository";

/**
 * POST /api/agent/[id]/publish — list the owner's agent in the public
 * gallery (`/gallery/agents`), where any signed-in user can fork it.
 * Publishable: the owner's own agent with Public or Readonly visibility —
 * the same gate `publishAgent` enforces in the UPDATE's WHERE, so a
 * concurrent switch to private can never race a publish through.
 */
export const POST = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id } = await params;

      const status = await agentInstallRepository.publishAgent(
        session.user.id,
        id,
      );
      if (status) {
        return Response.json({ publishedAt: status.publishedAt });
      }

      // Distinguish "not yours / does not exist" from "yours but private".
      const owned = await agentInstallRepository.getAgentPublicationStatus(
        session.user.id,
        id,
      );
      if (!owned) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      return Response.json(
        {
          error:
            "Set the agent's visibility to Public or Readonly before publishing it to the gallery.",
        },
        { status: 409 },
      );
    } catch (error) {
      console.error("Failed to publish agent:", error);
      return Response.json(
        { error: "Failed to publish agent" },
        { status: 500 },
      );
    }
  },
);

/** DELETE /api/agent/[id]/publish — take the owner's agent out of the gallery. */
export const DELETE = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id } = await params;
      const unpublished = await agentInstallRepository.unpublishAgent(
        session.user.id,
        id,
      );
      if (!unpublished) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      return Response.json({ publishedAt: null });
    } catch (error) {
      console.error("Failed to unpublish agent:", error);
      return Response.json(
        { error: "Failed to unpublish agent" },
        { status: 500 },
      );
    }
  },
);
