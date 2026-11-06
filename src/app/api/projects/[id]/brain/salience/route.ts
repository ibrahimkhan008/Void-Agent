import { getSession } from "auth/server";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";
import { recomputeProjectBrainSalience } from "lib/projects/recompute-brain-salience";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return new Response("Forbidden", { status: 403 });
    }
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  const rate = await checkApiRateLimit({
    kind: "project-brain-salience",
    id: session.user.id,
    limit: 4,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many project brain refreshes. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  const result = await recomputeProjectBrainSalience({
    projectId,
    collectionIds: access.project.collectionIds,
    ownerIds,
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
