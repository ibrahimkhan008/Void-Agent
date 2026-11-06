import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { collectionRepository } from "lib/db/repository";
import { getTeamRole, listProjectTeamsForUser } from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

// ---------------------------------------------------------------------------
// P2.1 follow-up — /api/collections (knowledge base)
// ---------------------------------------------------------------------------
//   GET   /api/collections   list the caller's collections
//   POST  /api/collections   create a collection
//
// Item ingest lives at /api/collections/[id]/items.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  name: z.string().min(1, "name is required").max(128, "name too long"),
  description: z.string().max(1000).optional(),
  teamId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const teams = await listProjectTeamsForUser(session.user.id);
    const collections = await collectionRepository.listAccessibleCollections(
      session.user.id,
      teams.map((team) => team.id),
    );
    return Response.json({ collections });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const teamId = parsed.data.teamId ?? null;
    if (teamId) {
      const role = await getTeamRole(teamId, session.user.id);
      if (role !== "owner" && role !== "editor") {
        return new Response("Forbidden", { status: 403 });
      }
    }
    const collection = await collectionRepository.createCollection(
      {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        orgId: teamId,
      },
      session.user.id,
    );
    return Response.json({ collection }, { status: 201 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
