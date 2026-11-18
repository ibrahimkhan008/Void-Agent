import { pgDb } from "@/lib/db/pg/db.pg";
import { ProjectTable } from "@/lib/db/pg/schema.pg";
import { publishInternalHookEvent } from "@/lib/hooks/internal-events";
import {
  requireProjectAccess,
  toProjectErrorResponse,
} from "@/lib/projects/access";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  goal: z.string().trim().max(4000).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  systemPrompt: z.string().max(8000).nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { project, role } = await requireProjectAccess({ projectId });
    return NextResponse.json({ project, role });
  } catch (error) {
    return toProjectErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { actor, project: previous } = await requireProjectAccess({
      projectId,
      minRole: "editor",
    });
    const parsed = UpdateProjectSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_project",
            message: parsed.error.issues[0]?.message ?? "Invalid project.",
          },
        },
        { status: 400 },
      );
    }

    const [project] = await pgDb
      .update(ProjectTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(ProjectTable.id, projectId))
      .returning();

    if (project) {
      await publishInternalHookEvent({
        userId: actor.userId,
        eventType: "project.updated",
        sourceId: `${project.id}:${project.updatedAt.toISOString()}`,
        text: `Project updated: ${project.name}`,
        meta: {
          projectId: project.id,
          name: project.name,
          previousName: previous.name,
        },
      }).catch((error) =>
        console.error("[hooks] project.updated enqueue failed", error),
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    return toProjectErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { actor, project } = await requireProjectAccess({
      projectId,
      minRole: "owner",
    });
    await pgDb.delete(ProjectTable).where(eq(ProjectTable.id, projectId));
    await publishInternalHookEvent({
      userId: actor.userId,
      eventType: "project.deleted",
      sourceId: projectId,
      text: `Project deleted: ${project.name}`,
      meta: { projectId, name: project.name },
    }).catch((error) =>
      console.error("[hooks] project.deleted enqueue failed", error),
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toProjectErrorResponse(error);
  }
}
