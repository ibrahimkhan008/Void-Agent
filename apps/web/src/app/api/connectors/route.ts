import { withAuth } from "auth/route-guard";
import { eq } from "drizzle-orm";
import { disconnectConnector } from "lib/connectors/oauth-flow";
import {
  OAUTH_PROVIDER_CONFIG,
  getOAuthClientCredentials,
} from "lib/connectors/oauth-providers";
import { getFreshdeskOrigin } from "lib/connectors/provider-api";
import { CONNECTOR_PROVIDER_CATALOG } from "lib/connectors/provider-catalog";
import { isConnectorProvider } from "lib/connectors/providers-list";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { isEncryptionAvailable } from "lib/security/encryption";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session) => {
  const rows = await pgDb
    .select({
      provider: UserConnectorTable.provider,
      email: UserConnectorTable.email,
      isConnected: UserConnectorTable.isConnected,
      isPaused: UserConnectorTable.isPaused,
      metadata: UserConnectorTable.metadata,
    })
    .from(UserConnectorTable)
    .where(eq(UserConnectorTable.userId, session.user.id));
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  const connectors = CONNECTOR_PROVIDER_CATALOG.map((entry) => {
    const config = OAUTH_PROVIDER_CONFIG[entry.provider];
    const directConfigured = Boolean(
      config && getOAuthClientCredentials(config) && isEncryptionAvailable(),
    );
    const row = byProvider.get(entry.provider);
    const name =
      row?.metadata && typeof row.metadata.name === "string"
        ? row.metadata.name.slice(0, 160)
        : undefined;
    return {
      provider: entry.provider,
      name: entry.name,
      authMode: entry.authMode,
      connectionFlow: directConfigured
        ? "direct-oauth"
        : entry.provider === "freshdesk" &&
            getFreshdeskOrigin() &&
            isEncryptionAvailable()
          ? "api-key"
          : entry.provider === "zulip" && isEncryptionAvailable()
            ? "api-key"
            : config
              ? "not-configured"
              : "not-integrated",
      isConnected: row?.isConnected === true,
      isPaused: row?.isPaused === true,
      ...(row?.email ? { account: row.email.slice(0, 320) } : {}),
      ...(name ? { accountName: name } : {}),
    };
  });
  return NextResponse.json({
    connectors,
    encryptionConfigured: isEncryptionAvailable(),
  });
});

export const DELETE = withAuth(async (request, session) => {
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  if (!isConnectorProvider(provider)) {
    return NextResponse.json({ error: "Unknown connector" }, { status: 400 });
  }
  await disconnectConnector(session.user.id, provider);
  return NextResponse.json({ success: true });
});
