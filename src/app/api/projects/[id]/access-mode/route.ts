import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectTable } from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { getProjectAccess } from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const accessModeSchema = z.object({ accessMode: z.enum(["team", "selected"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (access.role !== "owner")
    return new Response("Forbidden", { status: 403 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  if (!access.project.teamId) {
    return Response.json(
      { error: "Personal projects cannot use team collaborator access." },
      { status: 409 },
    );
  }

  const body = await readBoundedJsonRequest(request, 4_096);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = accessModeSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "Invalid access mode" }, { status: 400 });
  }

  // Narrow the update to the team observed during authorization so a concurrent
  // ownership/scope change cannot redirect this write.
  const [project] = await pgDb
    .update(ProjectTable)
    .set({ accessMode: parsed.data.accessMode, updatedAt: new Date() })
    .where(
      and(
        eq(ProjectTable.id, id),
        eq(ProjectTable.teamId, access.project.teamId),
      ),
    )
    .returning();
  if (!project) return new Response("Not found", { status: 404 });
  return Response.json(
    { project, role: access.role },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
