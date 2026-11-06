import { AgentCreateSchema, AgentQuerySchema } from "app-types/agent";
import { getSession } from "auth/server";
import {
  hashAgentApprovalPayload,
  isValidAgentApprovalRequestKey,
} from "lib/ai/tools/hitl/agent-approval";
import { canCreateAgent } from "lib/auth/permissions";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import {
  AgentApprovalIdempotencyConflictError,
  AgentApprovalReplayUnavailableError,
  insertApprovedAgentIdempotently,
} from "lib/db/pg/repositories/agent-repository.pg";
import { agentRepository } from "lib/db/repository";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const {
      type,
      filters: filtersParam,
      limit,
    } = AgentQuerySchema.parse(queryParams);

    // Parse filters - can be passed as comma-separated string or single type
    let filters;
    if (filtersParam) {
      filters = filtersParam.split(",").map((f) => f.trim());
    } else {
      // Fallback to single type parameter for backward compatibility
      filters = [type];
    }

    // Use the new simplified selectAgents method with database-level filtering and limiting
    const agents = await agentRepository.selectAgents(
      session.user.id,
      filters,
      limit,
    );
    return Response.json(agents);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid query parameters", details: error.message },
        { status: 400 },
      );
    }

    console.error("Failed to fetch agents:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check if user has permission to create agents
  const hasPermission = await canCreateAgent();
  if (!hasPermission) {
    return Response.json(
      { error: "You don't have permission to create agents" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const data = AgentCreateSchema.parse(body);
    const idempotencyKey = request.headers.get("Idempotency-Key");

    if (
      idempotencyKey !== null &&
      !isValidAgentApprovalRequestKey(idempotencyKey)
    ) {
      return Response.json(
        { error: "Invalid idempotency key" },
        { status: 400 },
      );
    }

    if (idempotencyKey) {
      const result = await insertApprovedAgentIdempotently(
        { ...data, userId: session.user.id },
        idempotencyKey,
        hashAgentApprovalPayload(data),
      );
      serverCache.delete(
        CacheKeys.agentInstructions(result.agent.id, session.user.id),
      );
      return Response.json(result.agent, {
        headers: { "Idempotency-Replayed": String(result.replayed) },
      });
    }

    const agent = await agentRepository.insertAgent({
      ...data,
      userId: session.user.id,
    });
    serverCache.delete(CacheKeys.agentInstructions(agent.id, session.user.id));

    return Response.json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.message },
        { status: 400 },
      );
    }

    if (error instanceof AgentApprovalIdempotencyConflictError) {
      return Response.json(
        { error: "Approval retry payload did not match the original request" },
        { status: 409 },
      );
    }

    if (error instanceof AgentApprovalReplayUnavailableError) {
      return Response.json(
        { error: "This approval already created an agent that was deleted" },
        { status: 410 },
      );
    }

    console.error("Failed to upsert agent:", error);
    return Response.json(
      { message: "Internal Server Error" },
      {
        status: 500,
      },
    );
  }
}
