import { withAuth } from "auth/route-guard";
import { beginConnectorOAuth } from "lib/connectors/oauth-flow";
import { isConnectorProvider } from "lib/connectors/providers-list";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ provider: string }> },
  ) => {
    const { provider: rawProvider } = await params;
    if (!isConnectorProvider(rawProvider)) {
      return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
    }
    const result = await beginConnectorOAuth(session.user.id, rawProvider);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(
      { authUrl: result.authUrl },
      {
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      },
    );
  },
);
