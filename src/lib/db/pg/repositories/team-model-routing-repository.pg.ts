import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  TeamModelRouteAuditTable,
  TeamModelRoutingPolicyTable,
  ChatThreadTable,
  type TeamModelRouteProfile,
} from "../schema.pg";
import type { TeamModelRouteTask } from "../schema.pg";

export const teamModelRoutingRepository = {
  async getThreadPin(threadId: string) {
    const [row] = await db
      .select({
        provider: ChatThreadTable.routingModelProvider,
        model: ChatThreadTable.routingModel,
      })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, threadId));
    return row?.provider && row.model
      ? { provider: row.provider, model: row.model }
      : null;
  },

  async pinThreadModel(threadId: string, provider: string, model: string) {
    const [row] = await db
      .update(ChatThreadTable)
      .set({ routingModelProvider: provider, routingModel: model })
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          isNull(ChatThreadTable.routingModelProvider),
          isNull(ChatThreadTable.routingModel),
        ),
      )
      .returning({
        provider: ChatThreadTable.routingModelProvider,
        model: ChatThreadTable.routingModel,
      });
    return row?.provider && row.model
      ? { provider: row.provider, model: row.model }
      : await teamModelRoutingRepository.getThreadPin(threadId);
  },

  async replaceThreadPin(threadId: string, provider: string, model: string) {
    const [row] = await db
      .update(ChatThreadTable)
      .set({ routingModelProvider: provider, routingModel: model })
      .where(eq(ChatThreadTable.id, threadId))
      .returning({
        provider: ChatThreadTable.routingModelProvider,
        model: ChatThreadTable.routingModel,
      });
    return row?.provider && row.model
      ? { provider: row.provider, model: row.model }
      : null;
  },

  async getPolicy(teamId: string) {
    const [row] = await db
      .select()
      .from(TeamModelRoutingPolicyTable)
      .where(eq(TeamModelRoutingPolicyTable.teamId, teamId));
    return row ?? { teamId, enabled: false, profiles: [], updatedByUserId: null };
  },

  async savePolicy({
    teamId,
    enabled,
    profiles,
    updatedByUserId,
  }: {
    teamId: string;
    enabled: boolean;
    profiles: TeamModelRouteProfile[];
    updatedByUserId: string;
  }) {
    const [row] = await db
      .insert(TeamModelRoutingPolicyTable)
      .values({ teamId, enabled, profiles, updatedByUserId })
      .onConflictDoUpdate({
        target: TeamModelRoutingPolicyTable.teamId,
        set: { enabled, profiles, updatedByUserId, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  async writeAudit(input: {
    teamId: string;
    userId: string;
    threadId?: string;
    taskKey: TeamModelRouteTask;
    selectedProvider: string;
    selectedModel: string;
    reasonCode: string;
  }) {
    const [row] = await db
      .insert(TeamModelRouteAuditTable)
      .values({ ...input, threadId: input.threadId ?? null })
      .returning({ id: TeamModelRouteAuditTable.id });
    return row;
  },

  async listAudits(
    teamId: string,
    options: { limit: number; cursor?: { id: string; createdAt: Date } },
  ) {
    const teamFilter = eq(TeamModelRouteAuditTable.teamId, teamId);
    const cursorFilter = options.cursor
      ? or(
          lt(TeamModelRouteAuditTable.createdAt, options.cursor.createdAt),
          and(
            eq(TeamModelRouteAuditTable.createdAt, options.cursor.createdAt),
            lt(TeamModelRouteAuditTable.id, options.cursor.id),
          ),
        )
      : undefined;
    return db
      .select({
        id: TeamModelRouteAuditTable.id,
        taskKey: TeamModelRouteAuditTable.taskKey,
        selectedProvider: TeamModelRouteAuditTable.selectedProvider,
        selectedModel: TeamModelRouteAuditTable.selectedModel,
        reasonCode: TeamModelRouteAuditTable.reasonCode,
        createdAt: TeamModelRouteAuditTable.createdAt,
      })
      .from(TeamModelRouteAuditTable)
      .where(cursorFilter ? and(teamFilter, cursorFilter) : teamFilter)
      .orderBy(
        desc(TeamModelRouteAuditTable.createdAt),
        desc(TeamModelRouteAuditTable.id),
      )
      .limit(Math.min(Math.max(options.limit, 1), 100) + 1);
  },
};
