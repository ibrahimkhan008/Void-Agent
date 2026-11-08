import { getSession } from "auth/server";
import { getProjectAccess } from "lib/projects/access";
import { searchAgentsetProjectKnowledge } from "lib/rag/agentset-provider";
import { filterCurrentAgentsetProjectSources } from "lib/rag/agentset-source-access";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_REQUEST_BYTES = 8_192;
const SearchSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(8).optional(),
});

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request)) {
    return privateJson({ error: "Forbidden" }, 403);
  }

  const session = await getSession();
  if (!session?.user?.id) return privateJson({ error: "Unauthorized" }, 401);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return privateJson({ error: "Request too large" }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return privateJson({ error: "Invalid request body" }, 400);
  }
  if (rawBody.length > MAX_REQUEST_BYTES) {
    return privateJson({ error: "Request too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return privateJson({ error: "Invalid JSON" }, 400);
  }
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return privateJson({ error: "Invalid search request" }, 400);
  }

  const { id: projectId } = await params;
  const access = await getProjectAccess(projectId, session.user.id);
  if (!access) return privateJson({ error: "Project not found" }, 404);

  if (
    process.env.AGENTSET_PROJECT_SEARCH_ENABLED !== "true" ||
    !process.env.AGENTSET_API_KEY?.trim()
  ) {
    return privateJson(
      {
        error: "Managed project search is not configured",
        code: "agentset_project_search_disabled",
      },
      503,
    );
  }

  try {
    const result = await searchAgentsetProjectKnowledge({
      projectId: access.project.id,
      query: parsed.data.query,
      limit: parsed.data.limit,
    });
    const visibleHits = await filterCurrentAgentsetProjectSources({
      projectId: access.project.id,
      userId: session.user.id,
      hits: result.results,
    });
    return privateJson({
      query: parsed.data.query,
      enabled: result.enabled,
      results: visibleHits,
      count: visibleHits.length,
    });
  } catch (error) {
    console.error("Managed project search failed", {
      projectId: access.project.id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return privateJson(
      {
        error: "Managed project search failed",
        code: "agentset_search_failed",
      },
      502,
    );
  }
}
