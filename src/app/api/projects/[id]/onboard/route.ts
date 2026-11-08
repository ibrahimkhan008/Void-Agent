import { getSession } from "auth/server";
import { eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectTable } from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

const stepSchema = z
  .object({
    step: z.enum([
      "goal",
      "knowledge",
      "documents",
      "tools",
      "people",
      "agents",
      "complete",
    ]),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });

  const parsedBody = await readBoundedJsonRequest(request, 1024);
  if (!parsedBody.ok)
    return Response.json(
      { error: parsedBody.error },
      { status: parsedBody.status },
    );
  const parsed = stepSchema.safeParse(parsedBody.value);
  if (!parsed.success)
    return Response.json({ error: "Invalid onboarding step" }, { status: 400 });

  const [project] = await pgDb
    .update(ProjectTable)
    .set({
      onboardingStep: parsed.data.step,
      ...(parsed.data.step === "complete"
        ? { onboardingCompletedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(ProjectTable.id, id))
    .returning({
      id: ProjectTable.id,
      onboardingStep: ProjectTable.onboardingStep,
      onboardingCompletedAt: ProjectTable.onboardingCompletedAt,
    });
  if (!project) return new Response("Not found", { status: 404 });
  return Response.json({ project }, { status: 200 });
}
