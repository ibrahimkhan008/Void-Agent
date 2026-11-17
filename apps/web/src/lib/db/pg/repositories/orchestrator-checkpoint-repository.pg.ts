import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { OrchestratorCheckpointTable } from "lib/db/pg/schema.pg";

export type StoredOrchestratorWorker = {
  key: string;
  role: "research" | "build" | "test";
  name: string;
  task: string;
  dependsOn?: string[];
};

export type StoredOrchestratorResult = {
  key: string;
  name: string;
  role: "research" | "build" | "test";
  status: "succeeded" | "failed";
  summary: string;
  attempts: number;
  toolCallCount: number;
};

export async function createOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
  objective: string;
  workers: StoredOrchestratorWorker[];
  verificationCriteria?: string;
}) {
  const [checkpoint] = await pgDb
    .insert(OrchestratorCheckpointTable)
    .values(input)
    .returning({ id: OrchestratorCheckpointTable.id });
  if (!checkpoint) throw new Error("Orchestrator checkpoint was not created");
  return checkpoint;
}

export async function getOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
}) {
  const [checkpoint] = await pgDb
    .select()
    .from(OrchestratorCheckpointTable)
    .where(
      and(
        eq(OrchestratorCheckpointTable.id, input.id),
        eq(OrchestratorCheckpointTable.userId, input.userId),
        eq(OrchestratorCheckpointTable.threadId, input.threadId),
      ),
    )
    .limit(1);
  return checkpoint ?? null;
}

export async function saveOrchestratorCheckpoint(input: {
  id: string;
  userId: string;
  threadId: string;
  completedWorkers: StoredOrchestratorResult[];
  status: "running" | "verifying" | "failed" | "done";
}) {
  const [checkpoint] = await pgDb
    .update(OrchestratorCheckpointTable)
    .set({
      completedWorkers: input.completedWorkers,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(OrchestratorCheckpointTable.id, input.id),
        eq(OrchestratorCheckpointTable.userId, input.userId),
        eq(OrchestratorCheckpointTable.threadId, input.threadId),
      ),
    )
    .returning({ id: OrchestratorCheckpointTable.id });
  if (!checkpoint) throw new Error("Orchestrator checkpoint was not found");
}
