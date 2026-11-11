import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  McpServerEntity,
  McpServerInstall,
  McpServerInstallTable,
  McpServerTable,
  NewMcpServerInstall,
} from "../schema.pg";
import { assertMcpInstallConfigSupported } from "./mcp-install-config";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — MCP install repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `mcp_server_install` table plus the read-side helpers
// the marketplace page needs:
//   * installMcpServer / uninstallMcpServer — write path. Always user-scoped
//     (a team install is just a personal install with `orgId` set).
//   * listMcpServerInstalls / getMcpServerInstall — read path; both accept
//     an optional `orgId` so the team dashboard can list team-wide installs
//     without leaking rows from other teams.
//   * listCuratedMcpServers / searchMcpServers / getMarketplaceMcpServer —
//     public read paths used by the marketplace page (no userId scope;
//     the marketplace is public).
// ---------------------------------------------------------------------------

export interface CreateMcpServerInstallInput {
  mcpServerId: string;
  config?: Record<string, unknown>;
}

export const mcpInstallRepository = {
  /**
   * Install a marketplace MCP server for a user (optionally a team).
   * UNIQUE (user_id, mcp_server_id) — re-installing updates the existing
   * row without incrementing the catalog counter a second time. The install
   * and counter update share a transaction.
   */
  async installMcpServer(
    input: CreateMcpServerInstallInput,
    userId: string,
    orgId?: string | null,
  ): Promise<McpServerInstall> {
    assertMcpInstallConfigSupported(input.config);
    return db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(McpServerInstallTable)
        .values({
          userId,
          orgId: orgId ?? null,
          mcpServerId: input.mcpServerId,
          config: input.config ?? {},
        } satisfies NewMcpServerInstall)
        .onConflictDoNothing({
          target: [
            McpServerInstallTable.userId,
            McpServerInstallTable.mcpServerId,
          ],
        })
        .returning();

      if (inserted) {
        await tx
          .update(McpServerTable)
          .set({ installCount: sql`${McpServerTable.installCount} + 1` })
          .where(eq(McpServerTable.id, input.mcpServerId));
        return inserted as McpServerInstall;
      }

      const [updated] = await tx
        .update(McpServerInstallTable)
        .set({ config: input.config ?? {}, orgId: orgId ?? null })
        .where(
          and(
            eq(McpServerInstallTable.userId, userId),
            eq(McpServerInstallTable.mcpServerId, input.mcpServerId),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error("MCP install could not be created or updated");
      }
      return updated as McpServerInstall;
    });
  },

  /**
   * Uninstall. Owner-scoped — a user can only uninstall their own row,
   * not a row that belongs to a different user / team.
   */
  async uninstallMcpServer(
    userId: string,
    mcpServerId: string,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const result = await tx
        .delete(McpServerInstallTable)
        .where(
          and(
            eq(McpServerInstallTable.userId, userId),
            eq(McpServerInstallTable.mcpServerId, mcpServerId),
          ),
        )
        .returning({ id: McpServerInstallTable.id });
      if (result.length === 0) return false;

      await tx
        .update(McpServerTable)
        .set({
          installCount: sql`GREATEST(${McpServerTable.installCount} - 1, 0)`,
        })
        .where(eq(McpServerTable.id, mcpServerId));
      return true;
    });
  },

  /**
   * List a user's installs. If `orgId` is provided, restrict to rows
   * tagged with that team — the team dashboard uses this. If `orgId`
   * is undefined, returns BOTH personal and team installs owned by
   * the user (the personal dashboard's "all my installs" view).
   */
  async listMcpServerInstalls(
    userId: string,
    orgId?: string | null,
  ): Promise<McpServerInstall[]> {
    const where = orgId
      ? and(
          eq(McpServerInstallTable.userId, userId),
          eq(McpServerInstallTable.orgId, orgId),
        )
      : eq(McpServerInstallTable.userId, userId);
    return (await db
      .select()
      .from(McpServerInstallTable)
      .where(where)
      .orderBy(desc(McpServerInstallTable.createdAt))) as McpServerInstall[];
  },

  async getMcpServerInstall(
    userId: string,
    mcpServerId: string,
  ): Promise<McpServerInstall | null> {
    const [row] = await db
      .select()
      .from(McpServerInstallTable)
      .where(
        and(
          eq(McpServerInstallTable.userId, userId),
          eq(McpServerInstallTable.mcpServerId, mcpServerId),
        ),
      );
    return (row as McpServerInstall | undefined) ?? null;
  },

  /**
   * Marketplace landing page: editor's picks, sorted by popularity.
   * Public — no userId scope. Uses the
   * `mcp_server_curated_idx` (curated, install_count DESC) compound
   * index defined in 0025.
   */
  async listCuratedMcpServers(
    limit = 50,
    offset = 0,
  ): Promise<McpServerEntity[]> {
    return (await db
      .select()
      .from(McpServerTable)
      .where(
        and(eq(McpServerTable.curated, true), eq(McpServerTable.enabled, true)),
      )
      .orderBy(desc(McpServerTable.installCount))
      .limit(limit)
      .offset(offset)) as McpServerEntity[];
  },

  /**
   * Marketplace search. Case-insensitive substring match across
   * `name` and `description`. Public — no userId scope.
   */
  async searchMcpServers(
    query: string,
    limit = 30,
  ): Promise<McpServerEntity[]> {
    const q = `%${query}%`;
    return (await db
      .select()
      .from(McpServerTable)
      .where(
        and(
          eq(McpServerTable.curated, true),
          eq(McpServerTable.enabled, true),
          or(
            ilike(McpServerTable.name, q),
            ilike(McpServerTable.description, q),
          ),
        ),
      )
      .orderBy(desc(McpServerTable.installCount))
      .limit(limit)) as McpServerEntity[];
  },

  /**
   * Marketplace detail page. Accepts either a server id (uuid) or a
   * slug-shaped name match; for the MVP we just match on id or exact
   * name. Returns null if no match.
   */
  async getMarketplaceMcpServer(
    slugOrId: string,
  ): Promise<McpServerEntity | null> {
    const [row] = await db
      .select()
      .from(McpServerTable)
      .where(
        and(
          eq(McpServerTable.curated, true),
          eq(McpServerTable.enabled, true),
          or(
            eq(McpServerTable.id, slugOrId),
            eq(McpServerTable.name, slugOrId),
          ),
        ),
      );
    return (row as McpServerEntity | undefined) ?? null;
  },
};
