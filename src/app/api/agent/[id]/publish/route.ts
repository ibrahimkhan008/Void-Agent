import { getSession } from "auth/server";
import { canEditAgent } from "lib/auth/permissions";
import { agentInstallRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const noStore = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const status = await agentInstallRepository.getAgentPublicationStatus(
    session.user.id,
    id,
  );
  if (!status) return new Response("Agent not found", { status: 404 });

  return Response.json(
    {
      publishedAt: status.publishedAt
        ? new Date(status.publishedAt).toISOString()
        : null,
      visibility: status.visibility,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  if (!(await canEditAgent()))
    return Response.json(
      { error: "You don't have permission to publish agents" },
      { status: 403, headers: noStore },
    );

  const rate = await checkApiRateLimit({
    kind: "agent-publish",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const { id } = await params;
  try {
    const status = await agentInstallRepository.publishAgent(
      session.user.id,
      id,
    );
    if (!status) {
      const owned = await agentInstallRepository.getAgentPublicationStatus(
        session.user.id,
        id,
      );
      return owned
        ? Response.json(
            {
              error:
                "Set agent visibility to public or readonly before publishing",
            },
            { status: 409, headers: noStore },
          )
        : new Response("Agent not found", { status: 404, headers: noStore });
    }

    revalidatePath("/gallery/agents");
    return Response.json(
      {
        publishedAt: status.publishedAt
          ? new Date(status.publishedAt).toISOString()
          : null,
        visibility: status.visibility,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not publish this agent" },
      { status: 500, headers: noStore },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  if (!(await canEditAgent()))
    return Response.json(
      { error: "You don't have permission to publish agents" },
      { status: 403, headers: noStore },
    );

  const rate = await checkApiRateLimit({
    kind: "agent-publish",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const { id } = await params;
  try {
    const unpublished = await agentInstallRepository.unpublishAgent(
      session.user.id,
      id,
    );
    if (!unpublished)
      return new Response("Agent not found", { status: 404, headers: noStore });

    revalidatePath("/gallery/agents");
    return Response.json({ publishedAt: null }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Could not unpublish this agent" },
      { status: 500, headers: noStore },
    );
  }
}
