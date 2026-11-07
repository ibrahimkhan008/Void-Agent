import "server-only";

import { tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainStatusSnapshotTable } from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import { loadProjectBrainStatusContext } from "lib/projects/project-brain-status";
import { z } from "zod";

const inputSchema = z.object({});

const trim = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

/**
 * Reads the latest source-scoped project status, accepted task proposals, and
 * recent timeline events for the project attached to the current chat.
 */
export function createProjectStatusTool(args: {
  userId: string;
  projectId: string;
  collectionIds: string[];
}) {
  return tool({
    description:
      "Get the current project's latest source-grounded health snapshot, accepted tasks, and recent accepted timeline events. Use this for concise questions about project progress or recent milestones. Only currently accessible, reviewed source data is returned; do not infer missing status.",
    inputSchema,
    execute: async () => {
      const access = await getProjectAccess(args.projectId, args.userId);
      if (!access)
        return {
          success: false,
          error: "This project is no longer available to you.",
        };

      const collectionIds = args.collectionIds.filter((id) =>
        access.project.collectionIds.includes(id),
      );
      const ownerIds = await getProjectCollectionSourceOwnerIds(access);
      const context = await loadProjectBrainStatusContext({
        project: access.project,
        collectionIds,
        ownerIds,
      });

      const [snapshot] = context
        ? await pgDb
            .select({
              health: ProjectBrainStatusSnapshotTable.health,
              progressPct: ProjectBrainStatusSnapshotTable.progressPct,
              summary: ProjectBrainStatusSnapshotTable.summary,
              blockers: ProjectBrainStatusSnapshotTable.blockers,
              createdAt: ProjectBrainStatusSnapshotTable.createdAt,
            })
            .from(ProjectBrainStatusSnapshotTable)
            .where(
              and(
                eq(ProjectBrainStatusSnapshotTable.projectId, args.projectId),
                eq(
                  ProjectBrainStatusSnapshotTable.inputFingerprint,
                  context.inputFingerprint,
                ),
              ),
            )
            .orderBy(desc(ProjectBrainStatusSnapshotTable.createdAt))
            .limit(1)
        : [];

      const blockers = Array.isArray(snapshot?.blockers)
        ? snapshot.blockers
            .filter((value): value is string => typeof value === "string")
            .slice(0, 5)
            .map((value) => value.slice(0, 200))
        : [];
      const createdAt = snapshot?.createdAt;

      return {
        success: true,
        project: {
          id: access.project.id,
          name: access.project.name.slice(0, 200),
        },
        status: snapshot
          ? {
              health: trim(snapshot.health, 20) || "unknown",
              progressPct:
                typeof snapshot.progressPct === "number"
                  ? Math.max(0, Math.min(100, snapshot.progressPct))
                  : null,
              summary: trim(snapshot.summary, 400),
              blockers,
              generatedAt:
                createdAt instanceof Date &&
                Number.isFinite(createdAt.getTime())
                  ? createdAt.toISOString()
                  : null,
            }
          : null,
        acceptedTasks: (context?.input.acceptedTasks ?? [])
          .slice(0, 10)
          .map((task) => ({
            title: task.title.slice(0, 200),
            details: task.details.slice(0, 300),
            dueDate: task.dueDate,
            status: "accepted" as const,
          })),
        recentEvents: (context?.input.acceptedTimelineEvents ?? [])
          .slice(0, 8)
          .map((event) => ({
            date: event.date,
            title: event.summary.slice(0, 140),
          })),
        ...(!snapshot
          ? { note: "No current status snapshot is available." }
          : {}),
      };
    },
  });
}
