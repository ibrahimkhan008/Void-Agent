import "server-only";

import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import {
  type ConnectorProvider,
  isConnectorProvider,
} from "lib/connectors/providers-list";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await params;
    if (!isConnectorProvider(provider)) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }
    const providerTyped: ConnectorProvider = provider;

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Connector not found" },
        { status: 404 },
      );
    }

    if (!rows[0].isConnected) {
      return NextResponse.json(
        { error: "Connector is not connected" },
        { status: 409 },
      );
    }

    // Pause is an idempotent state transition. It preserves OAuth credentials
    // so resume does not require another provider authorization flow.
    const updatedRows = await db
      .update(UserConnectorTable)
      .set({
        isPaused: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, providerTyped),
          eq(UserConnectorTable.isConnected, true),
        ),
      )
      .returning({ id: UserConnectorTable.id });
    if (updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Connector is no longer connected" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      status: "paused",
    });
  } catch (error) {
    console.error("Error pausing connector:", error);
    return NextResponse.json(
      { error: "Failed to pause connector" },
      { status: 500 },
    );
  }
}
