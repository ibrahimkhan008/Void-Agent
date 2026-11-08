import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { loadRevolutSummary, publicRevolutError } from "lib/cockpit/revolut";
import { withPrivateNoStore } from "lib/http/with-private-no-store";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = withPrivateNoStore(async (request: Request) => {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-revolut-summary",
      id: session.user.id,
      limit: 15,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsed = rawTeamId ? z.string().uuid().safeParse(rawTeamId) : null;
    if (rawTeamId && !parsed?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      parsed?.success ? parsed.data : null,
    );
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    const summary = await loadRevolutSummary(access.scope);
    if (!summary)
      return Response.json(
        { error: "Revolut is not connected" },
        { status: 404 },
      );
    return Response.json(summary, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: publicRevolutError(error) },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
});
