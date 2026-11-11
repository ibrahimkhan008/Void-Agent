export const dynamic = "force-dynamic";

/**
 * Native n8n editor sessions grant direct execution and activation privileges,
 * bypassing Void-Agent's reviewed execution boundary. Keep the route retired so
 * any stale iframe/bookmark fails closed without minting an editor JWT.
 */
export async function GET() {
  return Response.json(
    { error: "The embedded workflow editor is disabled." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
