import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import {
  type WorkflowExecutionEffect,
  WorkflowExecutionEffectSchema,
  type WorkflowExecutionInput,
  WorkflowExecutionInputSchema,
  WorkflowExecutionProgressSchema,
  type WorkflowNodeCheckpoint,
} from "lib/ai/workflow/execution-state";
import { decrypt, encrypt } from "lib/security/encryption";
import { pgDb } from "../db.pg";
import { WorkflowExecutionTable } from "../schema.pg";

const ENCRYPTED_PAYLOAD_KEY = "__voidAgentEncryptedWorkflowPayloadV1";

function encryptEffectPayload(effect: WorkflowExecutionEffect) {
  return {
    ...effect,
    payload: {
      [ENCRYPTED_PAYLOAD_KEY]: encrypt(JSON.stringify(effect.payload)),
    },
  };
}

function decryptEffectPayload(value: unknown): WorkflowExecutionEffect | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored workflow effect is invalid");
  }
  const candidate = value as Record<string, unknown>;
  const payload = candidate.payload;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload).length === 1 &&
    typeof (payload as Record<string, unknown>)[ENCRYPTED_PAYLOAD_KEY] ===
      "string"
  ) {
    const plaintext = decrypt(
      (payload as Record<string, string>)[ENCRYPTED_PAYLOAD_KEY],
    );
    return WorkflowExecutionEffectSchema.parse({
      ...candidate,
      payload: JSON.parse(plaintext),
    });
  }
  // Read legacy rows written before payload encryption was added.
  return WorkflowExecutionEffectSchema.parse(value);
}

function hydrateExecution<
  T extends {
    pendingEffect: unknown;
    approvedEffect: unknown;
  },
>(row: T) {
  return {
    ...row,
    pendingEffect: decryptEffectPayload(row.pendingEffect),
    approvedEffect: decryptEffectPayload(row.approvedEffect),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashWorkflowExecutionEffect(
  effect: Omit<WorkflowExecutionEffect, "hash" | "started">,
) {
  return createHash("sha256").update(canonicalJson(effect)).digest("hex");
}

const PROGRESS_PATCH_LIMIT = 1_000_000;

export const workflowExecutionRepository = {
  async listRecentForUser(userId: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit) || 20));
    return pgDb
      .select({
        id: WorkflowExecutionTable.id,
        workflowId: WorkflowExecutionTable.workflowId,
        workflowName: WorkflowExecutionTable.workflowName,
        graphRevision: WorkflowExecutionTable.graphRevision,
        progress: WorkflowExecutionTable.progress,
        status: WorkflowExecutionTable.status,
        expiresAt: WorkflowExecutionTable.expiresAt,
        createdAt: WorkflowExecutionTable.createdAt,
        updatedAt: WorkflowExecutionTable.updatedAt,
      })
      .from(WorkflowExecutionTable)
      .where(eq(WorkflowExecutionTable.userId, userId))
      .orderBy(desc(WorkflowExecutionTable.updatedAt))
      .limit(safeLimit);
  },

  /** Owner-scoped history read; unlike getForUser, this includes expired runs. */
  async getHistoryForUser(userId: string, executionId: string) {
    const [execution] = await pgDb
      .select()
      .from(WorkflowExecutionTable)
      .where(
        and(
          eq(WorkflowExecutionTable.id, executionId),
          eq(WorkflowExecutionTable.userId, userId),
        ),
      )
      .limit(1);
    return execution ?? null;
  },

  async create(input: {
    userId: string;
    workflowId: string;
    workflowName: string;
    graphRevision: string;
    input: WorkflowExecutionInput;
    expiresAt: Date;
  }) {
    const parsedInput = WorkflowExecutionInputSchema.parse(input.input);
    const [execution] = await pgDb
      .insert(WorkflowExecutionTable)
      .values({
        ...input,
        input: parsedInput,
        progress: { completedNodes: {} },
      })
      .returning();
    return execution;
  },

  async getActiveForUser(
    userId: string,
    executionId: string,
    now = new Date(),
  ) {
    const [execution] = await pgDb
      .select()
      .from(WorkflowExecutionTable)
      .where(
        and(
          eq(WorkflowExecutionTable.id, executionId),
          eq(WorkflowExecutionTable.userId, userId),
          gt(WorkflowExecutionTable.expiresAt, now),
          eq(WorkflowExecutionTable.status, "awaiting_approval"),
        ),
      )
      .limit(1);
    return execution ? hydrateExecution(execution) : null;
  },

  async getForUser(userId: string, executionId: string, now = new Date()) {
    const [execution] = await pgDb
      .select()
      .from(WorkflowExecutionTable)
      .where(
        and(
          eq(WorkflowExecutionTable.id, executionId),
          eq(WorkflowExecutionTable.userId, userId),
          gt(WorkflowExecutionTable.expiresAt, now),
        ),
      )
      .limit(1);
    return execution ? hydrateExecution(execution) : null;
  },

  async checkpoint(input: {
    userId: string;
    executionId: string;
    nodeId: string;
    checkpoint: WorkflowNodeCheckpoint;
    now?: Date;
  }) {
    const parsed = WorkflowExecutionProgressSchema.parse({
      completedNodes: { [input.nodeId]: input.checkpoint },
    }).completedNodes[input.nodeId];
    const patch = JSON.stringify({ [input.nodeId]: parsed });
    if (new TextEncoder().encode(patch).byteLength > PROGRESS_PATCH_LIMIT) {
      throw new Error("Workflow checkpoint exceeds the allowed size");
    }
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        progress: sql`jsonb_set(
          ${WorkflowExecutionTable.progress},
          '{completedNodes}',
          COALESCE(${WorkflowExecutionTable.progress}->'completedNodes', '{}'::jsonb) || ${patch}::jsonb,
          true
        )`,
        approvedEffect: sql`CASE
          WHEN ${WorkflowExecutionTable.approvedEffect}->>'nodeId' = ${input.nodeId}
            THEN NULL
          ELSE ${WorkflowExecutionTable.approvedEffect}
        END`,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "running"),
          gt(WorkflowExecutionTable.expiresAt, input.now ?? new Date()),
          lt(
            sql`octet_length((
              COALESCE(${WorkflowExecutionTable.progress}->'completedNodes', '{}'::jsonb)
              || ${patch}::jsonb
            )::text)`,
            PROGRESS_PATCH_LIMIT + 1,
          ),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async requestEffectApproval(input: {
    userId: string;
    executionId: string;
    effect: Omit<WorkflowExecutionEffect, "hash" | "started">;
    now?: Date;
  }) {
    const effect = WorkflowExecutionEffectSchema.parse({
      ...input.effect,
      hash: hashWorkflowExecutionEffect(input.effect),
      started: false,
    });
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        status: "awaiting_approval",
        pendingEffect: encryptEffectPayload(effect),
        approvedEffect: null,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "running"),
          gt(WorkflowExecutionTable.expiresAt, input.now ?? new Date()),
          isNull(WorkflowExecutionTable.pendingEffect),
          isNull(WorkflowExecutionTable.approvedEffect),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async approvePendingEffect(input: {
    userId: string;
    executionId: string;
    effectHash: string;
    now?: Date;
  }) {
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        status: "running",
        approvedEffect: sql`${WorkflowExecutionTable.pendingEffect}`,
        pendingEffect: null,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "awaiting_approval"),
          eq(
            sql`${WorkflowExecutionTable.pendingEffect}->>'hash'`,
            input.effectHash,
          ),
          gt(WorkflowExecutionTable.expiresAt, input.now ?? new Date()),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async cancelPendingApproval(input: {
    userId: string;
    executionId: string;
    effectHash: string;
    now?: Date;
  }) {
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        status: "cancelled",
        pendingEffect: null,
        approvedEffect: null,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "awaiting_approval"),
          eq(
            sql`${WorkflowExecutionTable.pendingEffect}->>'hash'`,
            input.effectHash,
          ),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async markApprovedEffectStarted(input: {
    userId: string;
    executionId: string;
    effectHash: string;
    now?: Date;
  }) {
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        approvedEffect: sql`jsonb_set(${WorkflowExecutionTable.approvedEffect}, '{started}', 'true'::jsonb, true)`,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "running"),
          eq(
            sql`${WorkflowExecutionTable.approvedEffect}->>'hash'`,
            input.effectHash,
          ),
          eq(
            sql`COALESCE((${WorkflowExecutionTable.approvedEffect}->>'started')::boolean, false)`,
            false,
          ),
          gt(WorkflowExecutionTable.expiresAt, input.now ?? new Date()),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async markEffectUncertain(input: {
    userId: string;
    executionId: string;
    error: string;
    now?: Date;
  }) {
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        status: "effect_uncertain",
        error: input.error.slice(0, 500),
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "running"),
          eq(
            sql`COALESCE((${WorkflowExecutionTable.approvedEffect}->>'started')::boolean, false)`,
            true,
          ),
        ),
      )
      .returning();
    return execution ?? null;
  },

  async finish(input: {
    userId: string;
    executionId: string;
    status: "completed" | "failed" | "cancelled";
    error?: string;
    now?: Date;
  }) {
    const [execution] = await pgDb
      .update(WorkflowExecutionTable)
      .set({
        status: input.status,
        error: input.error?.slice(0, 500) ?? null,
        pendingEffect: null,
        approvedEffect: null,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        and(
          eq(WorkflowExecutionTable.id, input.executionId),
          eq(WorkflowExecutionTable.userId, input.userId),
          eq(WorkflowExecutionTable.status, "running"),
        ),
      )
      .returning();
    return execution ?? null;
  },
};
