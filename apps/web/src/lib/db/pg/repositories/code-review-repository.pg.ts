import "server-only";

import { and, eq } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  CodeReviewRepoSetting,
  CodeReviewRepoSettingTable,
  CodeReviewUserPrefs,
  CodeReviewUserPrefsTable,
} from "../schema.pg";

/**
 * AI Code Review settings (ChatGPT Codex-style). Personal preferences are
 * the user-level defaults; a per-repository row overrides them field by
 * field (NULL = follow personal preferences), mirroring ChatGPT's "the
 * repository setting takes priority" semantics.
 */

export type CodeReviewTrigger = "pr_open" | "every_push" | "smart_detect";
export const CODE_REVIEW_TRIGGERS: CodeReviewTrigger[] = [
  "pr_open",
  "every_push",
  "smart_detect",
];

export interface EffectiveCodeReviewConfig {
  autoReview: boolean;
  reviewTrigger: CodeReviewTrigger;
  exhaustiveReview: boolean;
  reviewInstructions: string | null;
}

const isTrigger = (value: unknown): value is CodeReviewTrigger =>
  typeof value === "string" &&
  (CODE_REVIEW_TRIGGERS as string[]).includes(value);

export const codeReviewRepository = {
  async getUserPrefs(userId: string): Promise<CodeReviewUserPrefs> {
    const [row] = await db
      .select()
      .from(CodeReviewUserPrefsTable)
      .where(eq(CodeReviewUserPrefsTable.userId, userId))
      .limit(1);
    if (row) return row;
    const [created] = await db
      .insert(CodeReviewUserPrefsTable)
      .values({ userId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [raced] = await db
      .select()
      .from(CodeReviewUserPrefsTable)
      .where(eq(CodeReviewUserPrefsTable.userId, userId))
      .limit(1);
    return raced;
  },

  async updateUserPrefs(
    userId: string,
    input: { reviewTrigger?: CodeReviewTrigger; exhaustiveReview?: boolean },
  ): Promise<CodeReviewUserPrefs> {
    await this.getUserPrefs(userId);
    const [row] = await db
      .update(CodeReviewUserPrefsTable)
      .set({
        ...(input.reviewTrigger ? { reviewTrigger: input.reviewTrigger } : {}),
        ...(typeof input.exhaustiveReview === "boolean"
          ? { exhaustiveReview: input.exhaustiveReview }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(CodeReviewUserPrefsTable.userId, userId))
      .returning();
    return row;
  },

  async getRepoSetting(
    userId: string,
    repository: string,
  ): Promise<CodeReviewRepoSetting | null> {
    const [row] = await db
      .select()
      .from(CodeReviewRepoSettingTable)
      .where(
        and(
          eq(CodeReviewRepoSettingTable.userId, userId),
          eq(CodeReviewRepoSettingTable.repository, repository),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async listRepoSettings(userId: string): Promise<CodeReviewRepoSetting[]> {
    return db
      .select()
      .from(CodeReviewRepoSettingTable)
      .where(eq(CodeReviewRepoSettingTable.userId, userId));
  },

  async upsertRepoSetting(
    userId: string,
    repository: string,
    input: {
      autoReview?: boolean;
      reviewTrigger?: CodeReviewTrigger | null;
      exhaustiveReview?: boolean | null;
      reviewInstructions?: string | null;
      endpointId?: string | null;
      webhookId?: number | null;
    },
  ): Promise<CodeReviewRepoSetting> {
    const [row] = await db
      .insert(CodeReviewRepoSettingTable)
      .values({
        userId,
        repository,
        ...(typeof input.autoReview === "boolean"
          ? { autoReview: input.autoReview }
          : {}),
        ...(input.reviewTrigger !== undefined
          ? { reviewTrigger: input.reviewTrigger }
          : {}),
        ...(input.exhaustiveReview !== undefined
          ? { exhaustiveReview: input.exhaustiveReview }
          : {}),
        ...(input.reviewInstructions !== undefined
          ? { reviewInstructions: input.reviewInstructions }
          : {}),
        ...(input.endpointId !== undefined
          ? { endpointId: input.endpointId }
          : {}),
        ...(input.webhookId !== undefined
          ? { webhookId: input.webhookId }
          : {}),
      })
      .onConflictDoUpdate({
        target: [
          CodeReviewRepoSettingTable.userId,
          CodeReviewRepoSettingTable.repository,
        ],
        set: {
          ...(typeof input.autoReview === "boolean"
            ? { autoReview: input.autoReview }
            : {}),
          ...(input.reviewTrigger !== undefined
            ? { reviewTrigger: input.reviewTrigger }
            : {}),
          ...(input.exhaustiveReview !== undefined
            ? { exhaustiveReview: input.exhaustiveReview }
            : {}),
          ...(input.reviewInstructions !== undefined
            ? { reviewInstructions: input.reviewInstructions }
            : {}),
          ...(input.endpointId !== undefined
            ? { endpointId: input.endpointId }
            : {}),
          ...(input.webhookId !== undefined
            ? { webhookId: input.webhookId }
            : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  async deleteRepoSetting(userId: string, repository: string): Promise<void> {
    await db
      .delete(CodeReviewRepoSettingTable)
      .where(
        and(
          eq(CodeReviewRepoSettingTable.userId, userId),
          eq(CodeReviewRepoSettingTable.repository, repository),
        ),
      );
  },

  /** The enabled per-repo setting for one repository, if reviews are on. */
  async findEnabledByRepository(
    userId: string,
    repository: string,
  ): Promise<CodeReviewRepoSetting | null> {
    const [row] = await db
      .select()
      .from(CodeReviewRepoSettingTable)
      .where(
        and(
          eq(CodeReviewRepoSettingTable.userId, userId),
          eq(CodeReviewRepoSettingTable.repository, repository),
          eq(CodeReviewRepoSettingTable.autoReview, true),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Effective config: per-repo overrides win, personal preferences fill the
   * NULLs (ChatGPT semantics).
   */
  async resolveEffective(
    userId: string,
    repository: string,
  ): Promise<EffectiveCodeReviewConfig> {
    const [prefs, setting] = await Promise.all([
      this.getUserPrefs(userId),
      this.getRepoSetting(userId, repository),
    ]);
    const trigger = isTrigger(setting?.reviewTrigger)
      ? setting.reviewTrigger
      : isTrigger(prefs.reviewTrigger)
        ? prefs.reviewTrigger
        : "pr_open";
    return {
      autoReview: setting?.autoReview === true,
      reviewTrigger: trigger,
      exhaustiveReview:
        setting?.exhaustiveReview ?? prefs.exhaustiveReview ?? false,
      reviewInstructions: setting?.reviewInstructions ?? null,
    };
  },
};
