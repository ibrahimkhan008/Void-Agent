import { withAuth } from "auth/route-guard";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * GET /api/code-review/repositories — the user's GitHub repositories the
 * connector token can see, bounded for the settings picker.
 */
export const GET = withAuth(async (_request, session) => {
  try {
    const result = await callConnectorApi(
      session.user.id,
      "github",
      "/user/repos",
      {
        query: { per_page: 30, sort: "updated", direction: "desc" },
      },
    );
    const items = Array.isArray(result.items) ? result.items : [];
    return NextResponse.json({
      repositories: items.slice(0, 30).map((repo: Record<string, unknown>) => ({
        fullName: repo.full_name,
        private: repo.private === true,
        description:
          typeof repo.description === "string" ? repo.description : null,
        htmlUrl: repo.html_url,
        updatedAt: repo.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ConnectorApiError
            ? error.message
            : "Could not list GitHub repositories",
      },
      { status: 502 },
    );
  }
});
