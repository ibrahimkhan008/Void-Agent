import "server-only";

import { and, asc, eq } from "drizzle-orm";
import {
  type UserProviderModelCapability,
  parseUserProviderModelCatalog,
  serializeUserProviderModelCatalog,
} from "lib/ai/user-model-provider-capabilities";
import { decrypt, encrypt } from "lib/security/encryption";
import { pgDb as db } from "../db.pg";
import { UserModelProviderTable } from "../schema.pg";

export type UserModelProviderSummary = {
  id: string;
  name: string;
  baseUrl: string;
  modelIds: string[];
  capabilities: Record<string, UserProviderModelCapability>;
  hasApiKey: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toSummary = (
  row: typeof UserModelProviderTable.$inferSelect,
): UserModelProviderSummary => ({
  id: row.id,
  name: row.name,
  baseUrl: row.baseUrl,
  ...parseUserProviderModelCatalog(row.modelIds),
  hasApiKey: Boolean(row.encryptedApiKey),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const userModelProviderRepository = {
  async listForUser(userId: string): Promise<UserModelProviderSummary[]> {
    const rows = await db
      .select()
      .from(UserModelProviderTable)
      .where(eq(UserModelProviderTable.userId, userId))
      .orderBy(asc(UserModelProviderTable.createdAt));
    return rows.map(toSummary);
  },

  async getForRuntime(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(UserModelProviderTable)
      .where(
        and(
          eq(UserModelProviderTable.userId, userId),
          eq(UserModelProviderTable.id, id),
        ),
      )
      .limit(1);
    if (!row) return null;
    let apiKey = "";
    try {
      if (row.encryptedApiKey) apiKey = decrypt(row.encryptedApiKey);
    } catch {
      return null;
    }
    return { ...toSummary(row), apiKey };
  },

  async saveForUser(input: {
    userId: string;
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelIds: string[];
    capabilities?: Record<string, UserProviderModelCapability>;
  }): Promise<UserModelProviderSummary> {
    const existing = input.id
      ? await this.getForRuntime(input.userId, input.id)
      : null;
    if (input.id && !existing) throw new Error("Provider not found");
    const encryptedApiKey =
      input.apiKey !== undefined
        ? input.apiKey.trim()
          ? encrypt(input.apiKey.trim())
          : ""
        : ((await this.getEncryptedKey(input.userId, input.id)) ?? "");
    const values = {
      userId: input.userId,
      name: input.name,
      baseUrl: input.baseUrl,
      encryptedApiKey,
      modelIds: serializeUserProviderModelCatalog(
        input.modelIds,
        input.capabilities ?? {},
      ),
      updatedAt: new Date(),
    };
    const [row] = input.id
      ? await db
          .update(UserModelProviderTable)
          .set(values)
          .where(
            and(
              eq(UserModelProviderTable.userId, input.userId),
              eq(UserModelProviderTable.id, input.id),
            ),
          )
          .returning()
      : await db.insert(UserModelProviderTable).values(values).returning();
    if (!row) throw new Error("Provider could not be saved");
    return toSummary(row);
  },

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(UserModelProviderTable)
      .where(
        and(
          eq(UserModelProviderTable.userId, userId),
          eq(UserModelProviderTable.id, id),
        ),
      )
      .returning({ id: UserModelProviderTable.id });
    return rows.length > 0;
  },

  async isOwnedModel(userId: string, providerId: string, modelId: string) {
    const [row] = await db
      .select({ modelIds: UserModelProviderTable.modelIds })
      .from(UserModelProviderTable)
      .where(
        and(
          eq(UserModelProviderTable.userId, userId),
          eq(UserModelProviderTable.id, providerId),
        ),
      )
      .limit(1);
    return parseUserProviderModelCatalog(row?.modelIds).modelIds.includes(
      modelId,
    );
  },

  async getCapabilitiesForModel(
    userId: string,
    providerId: string,
    modelId: string,
  ) {
    const provider = await this.getForRuntime(userId, providerId);
    if (!provider?.modelIds.includes(modelId)) return null;
    return provider.capabilities[modelId] ?? { supportsToolCalling: false };
  },

  async getEncryptedKey(userId: string, id?: string) {
    if (!id) return null;
    const [row] = await db
      .select({ encryptedApiKey: UserModelProviderTable.encryptedApiKey })
      .from(UserModelProviderTable)
      .where(
        and(
          eq(UserModelProviderTable.userId, userId),
          eq(UserModelProviderTable.id, id),
        ),
      )
      .limit(1);
    return row?.encryptedApiKey ?? null;
  },
};
