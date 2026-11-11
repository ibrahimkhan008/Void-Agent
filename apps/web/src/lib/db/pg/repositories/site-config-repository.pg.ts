import "server-only";

import { desc, eq } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { SiteConfigAuditTable, SiteConfigTable } from "../schema.pg";

export interface DynamicProviderEntry {
  name: string;
  baseURL: string;
  apiKeyRef: string;
  enabled: boolean;
  models?: { name: string; apiModelId: string }[];
  addedAt?: string;
}

export interface DynamicTool {
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  addedAt: string;
}

export interface SiteConfigSettings {
  enabledProviders?: string[];
  defaultModels?: Record<string, string>;
  fallbackRouting?: Record<string, string>;
  canvasModel?: string;
  defaultSlideCount?: number;
  pptxExportEnabled?: boolean;
  artifactModel?: string;
  enabledTypes?: string[];
  appName?: string;
  appLogoUrl?: string;
  defaultToolChoice?: "auto" | "none" | "manual";
  freeTierDailyTokenLimit?: number;
  freeTierEnabled?: boolean;
  categories?: Record<
    string,
    { enabled: boolean; tools: Record<string, boolean> }
  >;
  apiKeys?: Record<string, boolean>;
  apiKeysSecrets?: Record<string, string>;
  dynamicProviders?: Record<string, DynamicProviderEntry>;
  dynamicTools?: Record<string, DynamicTool>;
  [key: string]: unknown;
}

export interface SiteConfigAuditEntry {
  id: string;
  key: string;
  settings: SiteConfigSettings;
  changedBy: string;
  changedAt: Date;
  changeType: "create" | "update" | "reset";
}

export interface SiteConfigRepository {
  getConfig: (key: string) => Promise<SiteConfigSettings | null>;
  upsert: (
    key: string,
    settings: SiteConfigSettings,
    userId?: string,
    changeType?: "create" | "update",
  ) => Promise<void>;
  getAll: () => Promise<Record<string, SiteConfigSettings>>;
  getAuditLog: (limit?: number) => Promise<SiteConfigAuditEntry[]>;
}

export const siteConfigRepository: SiteConfigRepository = {
  async getConfig(key) {
    const [row] = await db
      .select()
      .from(SiteConfigTable)
      .where(eq(SiteConfigTable.key, key))
      .limit(1);
    return row ? (row.settings as SiteConfigSettings) : null;
  },

  async upsert(key, settings, userId, changeType = "update") {
    await db
      .insert(SiteConfigTable)
      .values({ key, settings })
      .onConflictDoUpdate({
        target: SiteConfigTable.key,
        set: { settings },
      });

    // The caller may pass "unknown" when the change was not user initiated.
    // Keep the destination contract: only UUID-backed admin changes are audited.
    if (userId && userId !== "unknown") {
      await db.insert(SiteConfigAuditTable).values({
        key,
        settings,
        changedBy: userId,
        changeType,
      });
    }
  },

  async getAll() {
    const rows = await db.select().from(SiteConfigTable);
    return Object.fromEntries(
      rows.map((row) => [row.key, row.settings as SiteConfigSettings]),
    );
  },

  async getAuditLog(limit = 50) {
    const rows = await db
      .select()
      .from(SiteConfigAuditTable)
      .orderBy(desc(SiteConfigAuditTable.changedAt))
      .limit(limit);
    return rows as SiteConfigAuditEntry[];
  },
};
