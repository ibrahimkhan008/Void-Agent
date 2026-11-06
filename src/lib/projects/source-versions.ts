import "server-only";

import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  ProjectBrainSourceStateTable,
  ProjectBrainSourceVersionTable,
} from "lib/db/pg/schema.pg";
import { projectBrainSourceFingerprint } from "lib/projects/brain-schema";

type BrainVersionExecutor = Pick<typeof pgDb, "insert" | "select" | "update">;

export function resolveProjectBrainSourceSnapshot(input: {
  sourceItemId: string;
  sourceFingerprint: string;
  contentLength: number;
  contentSnapshot: string | null;
  currentSourceText: string;
}) {
  const sourceText = input.contentSnapshot ?? input.currentSourceText;
  if (
    !sourceText.trim() ||
    projectBrainSourceFingerprint(input.sourceItemId, sourceText) !==
      input.sourceFingerprint
  ) {
    throw new Error(
      "The source changed after this analysis was queued. Please retry it.",
    );
  }
  if (input.contentLength > 0 && input.contentLength !== sourceText.length) {
    throw new Error(
      "The recorded source revision no longer matches this queued analysis.",
    );
  }
  return sourceText;
}

/** Idempotently stores the exact bounded source bytes used for each analysis. */
export async function ensureProjectBrainSourceVersion(
  executor: BrainVersionExecutor,
  input: {
    projectId: string;
    sourceItemId: string;
    sourceFingerprint: string;
    contentSnapshot: string;
  },
) {
  const contentLength = input.contentSnapshot.length;
  if (
    !Number.isInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > 60_000
  ) {
    throw new Error(
      "Project brain source length is outside the supported bound.",
    );
  }
  if (
    projectBrainSourceFingerprint(input.sourceItemId, input.contentSnapshot) !==
    input.sourceFingerprint
  ) {
    throw new Error(
      "Project brain source version fingerprint does not match its content.",
    );
  }

  const [created] = await executor
    .insert(ProjectBrainSourceVersionTable)
    .values({ ...input, contentLength })
    .onConflictDoNothing({
      target: [
        ProjectBrainSourceVersionTable.projectId,
        ProjectBrainSourceVersionTable.sourceItemId,
        ProjectBrainSourceVersionTable.sourceFingerprint,
      ],
    })
    .returning({ id: ProjectBrainSourceVersionTable.id });
  if (created) {
    await setActiveProjectBrainSourceVersion(executor, input, created.id);
    return created.id;
  }

  const [existing] = await executor
    .select({
      id: ProjectBrainSourceVersionTable.id,
      contentLength: ProjectBrainSourceVersionTable.contentLength,
      contentSnapshot: ProjectBrainSourceVersionTable.contentSnapshot,
    })
    .from(ProjectBrainSourceVersionTable)
    .where(
      and(
        eq(ProjectBrainSourceVersionTable.projectId, input.projectId),
        eq(ProjectBrainSourceVersionTable.sourceItemId, input.sourceItemId),
        eq(
          ProjectBrainSourceVersionTable.sourceFingerprint,
          input.sourceFingerprint,
        ),
      ),
    )
    .limit(1);
  if (
    !existing ||
    (existing.contentLength > 0 && existing.contentLength !== contentLength)
  ) {
    throw new Error(
      "Project brain source version metadata conflicts with its fingerprint.",
    );
  }
  if (existing.contentSnapshot !== input.contentSnapshot) {
    if (existing.contentSnapshot !== null || existing.contentLength !== 0) {
      throw new Error(
        "Project brain source version content conflicts with its fingerprint.",
      );
    }
    await executor
      .update(ProjectBrainSourceVersionTable)
      .set({ contentSnapshot: input.contentSnapshot, contentLength })
      .where(
        and(
          eq(ProjectBrainSourceVersionTable.id, existing.id),
          eq(ProjectBrainSourceVersionTable.contentLength, 0),
        ),
      );
  }
  await setActiveProjectBrainSourceVersion(executor, input, existing.id);
  return existing.id;
}

async function setActiveProjectBrainSourceVersion(
  executor: BrainVersionExecutor,
  input: { projectId: string; sourceItemId: string },
  sourceVersionId: string,
) {
  await executor
    .insert(ProjectBrainSourceStateTable)
    .values({
      ...input,
      sourceVersionId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        ProjectBrainSourceStateTable.projectId,
        ProjectBrainSourceStateTable.sourceItemId,
      ],
      set: { sourceVersionId, updatedAt: new Date() },
    });
}
