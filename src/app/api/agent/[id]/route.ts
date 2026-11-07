import { AgentUpdateSchema } from "app-types/agent";
import { getSession } from "auth/server";
import { normalizeAgentFileBindings } from "lib/ai/agent/agent-files";
import { isEnabledAgentModel } from "lib/ai/agent/pinned-model";
import { canDeleteAgent, canEditAgent } from "lib/auth/permissions";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import { agentRepository } from "lib/db/repository";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await agentRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const agent = await agentRepository.selectAgentById(id, session.user.id);
  return Response.json(agent);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check if user has permission to edit agents
  const canEdit = await canEditAgent();
  if (!canEdit) {
    return Response.json(
      { error: "Only editors and admins can edit agents" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    // Check access for write operations
    const hasAccess = await agentRepository.checkAccess(id, session.user.id);
    if (!hasAccess) {
      return new Response("Unauthorized", { status: 401 });
    }

    const existingAgent = await agentRepository.selectAgentById(
      id,
      session.user.id,
    );
    const submittedInstructions =
      body && typeof body === "object" && "instructions" in body &&
      body.instructions && typeof body.instructions === "object"
        ? (body.instructions as Record<string, unknown>)
        : {};
    const fileBindings = normalizeAgentFileBindings({
      files: submittedInstructions.files,
      userId: session.user.id,
      existingFiles: existingAgent?.instructions.files,
    });
    if (!fileBindings.ok) {
      return Response.json(
        {
          error:
            fileBindings.reason === "not-owned"
              ? "Agent files must belong to the current user"
              : "Invalid agent file bindings",
        },
        { status: 400 },
      );
    }
    const normalizedBody = {
      ...(body as Record<string, unknown>),
      ...(body &&
      typeof body === "object" &&
      "instructions" in body &&
      body.instructions &&
      typeof body.instructions === "object"
        ? {
            instructions: {
              ...submittedInstructions,
              ...(submittedInstructions.files !== undefined
                ? { files: fileBindings.files }
                : {}),
            },
          }
        : {}),
    };
    const data = AgentUpdateSchema.parse(normalizedBody);

    if (
      data.instructions?.model &&
      !(await isEnabledAgentModel(data.instructions.model))
    ) {
      return Response.json(
        {
          code: "agent-model-unavailable",
          error: "Choose a model from the currently enabled model catalog.",
        },
        { status: 409 },
      );
    }

    // For non-owners of public agents, preserve original visibility
    if (existingAgent && existingAgent.userId !== session.user.id) {
      data.visibility = existingAgent.visibility;
    }

    const agent = await agentRepository.updateAgent(id, session.user.id, data);
    serverCache.delete(CacheKeys.agentInstructions(agent.id, session.user.id));

    return Response.json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.message },
        { status: 400 },
      );
    }

    console.error("Failed to update agent:", error);
    return Response.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check if user has permission to delete agents
  const canDelete = await canDeleteAgent();
  if (!canDelete) {
    return Response.json(
      { error: "Only editors and admins can delete agents" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const hasAccess = await agentRepository.checkAccess(
      id,
      session.user.id,
      true, // destructive = true for delete operations
    );
    if (!hasAccess) {
      return new Response("Unauthorized", { status: 401 });
    }
    await agentRepository.deleteAgent(id, session.user.id);
    serverCache.delete(CacheKeys.agentInstructions(id, session.user.id));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete agent:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
