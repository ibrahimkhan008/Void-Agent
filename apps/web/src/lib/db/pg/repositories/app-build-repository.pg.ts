import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { pgDb } from "../db.pg";
import { AppBuildTable, ChatThreadTable } from "../schema.pg";

export type AppBuild = typeof AppBuildTable.$inferSelect;
export type AppBuildFile = { path: string; content: string };
export type AppBuildPatch = Partial<
  Pick<
    AppBuild,
    | "title"
    | "summary"
    | "files"
    | "status"
    | "previewUrl"
    | "sandboxId"
    | "error"
  >
>;
export type CreateAppBuildResult =
  | { status: "created"; build: AppBuild }
  | { status: "thread_not_found" }
  | { status: "active_limit" };

export const pgAppBuildRepository = {
  async appendLogForOwner(
    id: string,
    userId: string,
    message: string,
  ): Promise<boolean> {
    // Only internal, bounded stage messages belong here. Keep the durable
    // transcript bounded even for a long-running build with repeated retries.
    const line = `${new Date().toISOString()} ${message
      .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
      .slice(0, 500)}\n`;
    const [row] = await pgDb
      .update(AppBuildTable)
      .set({
        buildLog: sql`right(${AppBuildTable.buildLog} || ${line}, 20000)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(AppBuildTable.id, id),
          eq(AppBuildTable.userId, userId),
          inArray(AppBuildTable.status, [
            "queued",
            "generating",
            "provisioning",
            "ready",
            "failed",
          ]),
        ),
      )
      .returning({ id: AppBuildTable.id });
    return Boolean(row);
  },

  async threadOwnedBy(threadId: string, userId: string): Promise<boolean> {
    const [row] = await pgDb
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  },

  async countActiveForOwner(userId: string): Promise<number> {
    const [row] = await pgDb
      .select({ count: sql<number>`count(*)::int` })
      .from(AppBuildTable)
      .where(
        and(
          eq(AppBuildTable.userId, userId),
          inArray(AppBuildTable.status, [
            "queued",
            "generating",
            "provisioning",
          ]),
        ),
      );
    return Number(row?.count ?? 0);
  },

  async create(input: {
    id: string;
    userId: string;
    threadId: string;
    prompt: string;
  }): Promise<AppBuild> {
    const [row] = await pgDb
      .insert(AppBuildTable)
      .values({ ...input, status: "queued" })
      .returning();
    return row;
  },

  async createIfCapacity(input: {
    id: string;
    userId: string;
    threadId: string;
    prompt: string;
    activeLimit: number;
  }): Promise<CreateAppBuildResult> {
    return pgDb.transaction(async (tx) => {
      // Serialize per-user admission so concurrent POSTs cannot both pass an
      // active-build count and exceed the billable sandbox cap.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
      );
      const [thread] = await tx
        .select({ id: ChatThreadTable.id })
        .from(ChatThreadTable)
        .where(
          and(
            eq(ChatThreadTable.id, input.threadId),
            eq(ChatThreadTable.userId, input.userId),
          ),
        )
        .limit(1);
      if (!thread) return { status: "thread_not_found" };

      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(AppBuildTable)
        .where(
          and(
            eq(AppBuildTable.userId, input.userId),
            inArray(AppBuildTable.status, [
              "queued",
              "generating",
              "provisioning",
            ]),
          ),
        );
      if (Number(active?.count ?? 0) >= input.activeLimit) {
        return { status: "active_limit" };
      }

      const [build] = await tx
        .insert(AppBuildTable)
        .values({
          id: input.id,
          userId: input.userId,
          threadId: input.threadId,
          prompt: input.prompt,
          status: "queued",
        })
        .returning();
      return { status: "created", build };
    });
  },

  async listForOwner(userId: string, limit = 50): Promise<AppBuild[]> {
    return pgDb
      .select()
      .from(AppBuildTable)
      .where(eq(AppBuildTable.userId, userId))
      .orderBy(desc(AppBuildTable.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
  },

  async getForOwner(id: string, userId: string): Promise<AppBuild | null> {
    const [row] = await pgDb
      .select()
      .from(AppBuildTable)
      .where(and(eq(AppBuildTable.id, id), eq(AppBuildTable.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async updateForOwner(
    id: string,
    userId: string,
    patch: AppBuildPatch,
  ): Promise<AppBuild | null> {
    const [row] = await pgDb
      .update(AppBuildTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(AppBuildTable.id, id), eq(AppBuildTable.userId, userId)))
      .returning();
    return row ?? null;
  },

  async updateActiveForOwner(
    id: string,
    userId: string,
    patch: AppBuildPatch,
  ): Promise<AppBuild | null> {
    const [row] = await pgDb
      .update(AppBuildTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(AppBuildTable.id, id),
          eq(AppBuildTable.userId, userId),
          inArray(AppBuildTable.status, [
            "queued",
            "generating",
            "provisioning",
          ]),
        ),
      )
      .returning();
    return row ?? null;
  },

  async cancelForOwner(id: string, userId: string): Promise<AppBuild | null> {
    const [row] = await pgDb
      .update(AppBuildTable)
      .set({
        status: "cancelled",
        error: "Build cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(AppBuildTable.id, id),
          eq(AppBuildTable.userId, userId),
          inArray(AppBuildTable.status, [
            "queued",
            "generating",
            "provisioning",
          ]),
        ),
      )
      .returning();
    return row ?? null;
  },

  async beginResumeForOwner(
    id: string,
    userId: string,
    activeLimit: number,
  ): Promise<AppBuild | null> {
    return pgDb.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
      );
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(AppBuildTable)
        .where(
          and(
            eq(AppBuildTable.userId, userId),
            inArray(AppBuildTable.status, [
              "queued",
              "generating",
              "provisioning",
            ]),
          ),
        );
      if (Number(active?.count ?? 0) >= activeLimit) return null;
      const [row] = await tx
        .update(AppBuildTable)
        .set({
          status: "provisioning",
          previewUrl: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(AppBuildTable.id, id),
            eq(AppBuildTable.userId, userId),
            inArray(AppBuildTable.status, ["ready", "failed"]),
          ),
        )
        .returning();
      return row ?? null;
    });
  },

  async deleteForOwner(id: string, userId: string): Promise<boolean> {
    const rows = await pgDb
      .delete(AppBuildTable)
      .where(and(eq(AppBuildTable.id, id), eq(AppBuildTable.userId, userId)))
      .returning({ id: AppBuildTable.id });
    return rows.length > 0;
  },
};
