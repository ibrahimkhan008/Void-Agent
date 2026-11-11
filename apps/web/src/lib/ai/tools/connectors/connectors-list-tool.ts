import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { CONNECTOR_PROVIDER_CATALOG } from "lib/connectors/provider-catalog";

export function createConnectorsListToolForUser(userId: string) {
  return tool({
    description:
      "List the external accounts connected to the authenticated user. Does not return credentials or tokens.",
    inputSchema: z.object({}).strict(),
    execute: async () => {
      const rows = await pgDb
        .select({
          provider: UserConnectorTable.provider,
          email: UserConnectorTable.email,
          isConnected: UserConnectorTable.isConnected,
          isPaused: UserConnectorTable.isPaused,
        })
        .from(UserConnectorTable)
        .where(eq(UserConnectorTable.userId, userId));
      const names = new Map(
        CONNECTOR_PROVIDER_CATALOG.map((entry) => [entry.provider, entry.name]),
      );
      return {
        connectors: rows
          .filter((row) => row.isConnected && !row.isPaused)
          .map((row) => ({
            provider: row.provider,
            name: names.get(row.provider) ?? row.provider,
            ...(row.email ? { account: row.email.slice(0, 320) } : {}),
          })),
      };
    },
  });
}
