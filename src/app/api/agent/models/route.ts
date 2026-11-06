import { getSession } from "auth/server";
import { getEnabledAgentModelCatalog } from "lib/ai/agent/pinned-model";
import { canCreateAgent } from "lib/auth/permissions";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!(await canCreateAgent())) {
    return Response.json(
      { error: "You don't have permission to create agents" },
      { status: 403 },
    );
  }

  try {
    const models = await getEnabledAgentModelCatalog();
    return Response.json(
      { models },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load enabled agent models" },
      { status: 503 },
    );
  }
}
