import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { isUserStorageKey } from "lib/file-storage/storage-utils";
import { z } from "zod";
import { pgDb } from "../db.pg";
import {
  FileCleanupOutboxTable,
  ProjectDocumentEditTable,
  ProjectDocumentTable,
} from "../schema.pg";

export const projectDocumentEditProposalSchema = z
  .object({
    originalText: z.string().min(1).max(10_000),
    suggestedText: z.string().min(1).max(10_000),
    rationale: z.string().max(2_000),
  })
  .strict();

export const projectDocumentEditProposalsSchema = z
  .array(projectDocumentEditProposalSchema)
  .max(50)
  .superRefine((edits, context) => {
    const bytes = new TextEncoder().encode(JSON.stringify(edits)).byteLength;
    if (bytes > 512 * 1024)
      context.addIssue({
        code: "custom",
        message: "Edit proposals exceed the storage limit",
      });
  });

export const projectDocumentTrackedChangesSchema = z
  .array(
    z
      .object({
        id: z.string().uuid(),
        delId: z
          .string()
          .regex(/^\d{1,10}$/)
          .optional(),
        insId: z
          .string()
          .regex(/^\d{1,10}$/)
          .optional(),
      })
      .strict()
      .refine((change) => Boolean(change.delId || change.insId)),
  )
  .min(1)
  .max(50)
  .superRefine((changes, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(changes)).byteLength >
      16 * 1024
    )
      context.addIssue({
        code: "custom",
        message: "Tracked revision metadata exceeds the storage limit",
      });
  });

export type ProjectDocumentEditProposal = z.infer<
  typeof projectDocumentEditProposalSchema
>;
export type ProjectDocumentTrackedChange = z.infer<
  typeof projectDocumentTrackedChangesSchema
>[number];
export type ProjectDocumentEditStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "stale";

function assertSourceHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Invalid project document source revision hash");
  }
}

function assertOwnedCandidateKey(key: string, userId: string): void {
  if (
    key.length > 2_000 ||
    /^https?:\/\//i.test(key) ||
    key.includes("\\") ||
    key.includes("..") ||
    !isUserStorageKey(key, userId)
  ) {
    throw new Error("Invalid private project document candidate key");
  }
}

export const projectDocumentEditRepository = {
  async createPending(input: {
    projectId: string;
    projectDocumentId: string;
    createdByUserId: string;
    sourceRevisionHash: string;
    candidateStorageKey: string;
    proposedEdits: ProjectDocumentEditProposal[];
    trackedChanges: ProjectDocumentTrackedChange[];
  }) {
    assertSourceHash(input.sourceRevisionHash);
    assertOwnedCandidateKey(input.candidateStorageKey, input.createdByUserId);
    const parsed = projectDocumentEditProposalsSchema.safeParse(
      input.proposedEdits,
    );
    if (!parsed.success || parsed.data.length === 0)
      throw new Error("Invalid project document edit proposals");
    const parsedChanges = projectDocumentTrackedChangesSchema.safeParse(
      input.trackedChanges,
    );
    if (!parsedChanges.success)
      throw new Error("Invalid project document tracked revision metadata");

    return pgDb.transaction(async (tx) => {
      const [document] = await tx
        .select({ id: ProjectDocumentTable.id })
        .from(ProjectDocumentTable)
        .where(
          and(
            eq(ProjectDocumentTable.id, input.projectDocumentId),
            eq(ProjectDocumentTable.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!document) throw new Error("Project document is unavailable");

      const [row] = await tx
        .insert(ProjectDocumentEditTable)
        .values({
          projectId: input.projectId,
          projectDocumentId: input.projectDocumentId,
          createdByUserId: input.createdByUserId,
          sourceRevisionHash: input.sourceRevisionHash,
          candidateStorageKey: input.candidateStorageKey,
          proposedEdits: parsed.data,
          trackedChanges: parsedChanges.data,
          status: "pending",
        })
        .returning();
      if (!row) throw new Error("Failed to create project document edit");
      return row;
    });
  },

  async selectByProject(input: { id: string; projectId: string }) {
    const [row] = await pgDb
      .select()
      .from(ProjectDocumentEditTable)
      .where(
        and(
          eq(ProjectDocumentEditTable.id, input.id),
          eq(ProjectDocumentEditTable.projectId, input.projectId),
        ),
      )
      .limit(1);
    return row;
  },

  async listByProjectDocument(input: {
    projectDocumentId: string;
    projectId: string;
  }) {
    return pgDb
      .select()
      .from(ProjectDocumentEditTable)
      .where(
        and(
          eq(
            ProjectDocumentEditTable.projectDocumentId,
            input.projectDocumentId,
          ),
          eq(ProjectDocumentEditTable.projectId, input.projectId),
        ),
      )
      .orderBy(desc(ProjectDocumentEditTable.createdAt));
  },

  /**
   * Serializes review decisions and makes source-version invalidation durable.
   * Rejected/stale candidate objects enter the cleanup outbox in this same
   * transaction, so a crash cannot strand the state transition without cleanup.
   */
  async resolvePending(input: {
    id: string;
    projectId: string;
    currentSourceRevisionHash: string;
    decision: "accepted" | "rejected";
    outputStorageKey?: string;
  }): Promise<
    | {
        outcome: "resolved";
        edit: typeof ProjectDocumentEditTable.$inferSelect;
      }
    | { outcome: "stale" }
    | { outcome: "not_found" }
    | { outcome: "conflict" }
  > {
    assertSourceHash(input.currentSourceRevisionHash);
    if (input.decision === "accepted" && !input.outputStorageKey)
      throw new Error("Accepted edits require a private output file");
    if (input.decision === "rejected" && input.outputStorageKey)
      throw new Error("Rejected edits cannot retain an output file");
    return pgDb.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(ProjectDocumentEditTable)
        .where(
          and(
            eq(ProjectDocumentEditTable.id, input.id),
            eq(ProjectDocumentEditTable.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) return { outcome: "not_found" } as const;
      if (row.status !== "pending") return { outcome: "conflict" } as const;

      const candidateKey = row.candidateStorageKey;
      if (
        candidateKey &&
        !isUserStorageKey(candidateKey, row.createdByUserId)
      ) {
        throw new Error("Unsafe project document candidate key");
      }
      if (input.outputStorageKey)
        assertOwnedCandidateKey(input.outputStorageKey, row.createdByUserId);
      const stale = row.sourceRevisionHash !== input.currentSourceRevisionHash;
      const nextStatus = stale ? "stale" : input.decision;
      const resolvedAt = new Date();

      const outputKey = stale ? undefined : input.outputStorageKey;
      const cleanupKeys = [candidateKey, input.outputStorageKey].filter(
        (key): key is string => Boolean(key) && key !== outputKey,
      );
      for (const storageKey of new Set(cleanupKeys)) {
        await tx.insert(FileCleanupOutboxTable).values({
          userId: row.createdByUserId,
          storageKey,
        });
      }
      const [updated] = await tx
        .update(ProjectDocumentEditTable)
        .set({
          status: nextStatus,
          candidateStorageKey: null,
          outputStorageKey: outputKey ?? null,
          resolvedAt,
          updatedAt: resolvedAt,
        })
        .where(
          and(
            eq(ProjectDocumentEditTable.id, row.id),
            eq(ProjectDocumentEditTable.projectId, input.projectId),
            eq(ProjectDocumentEditTable.status, "pending"),
          ),
        )
        .returning();
      if (!updated) return { outcome: "conflict" } as const;
      if (stale) return { outcome: "stale" } as const;
      return { outcome: "resolved", edit: updated } as const;
    });
  },
};
