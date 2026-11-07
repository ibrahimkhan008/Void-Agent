import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { loadStripeSnapshot } from "lib/cockpit/stripe";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-stripe-summary",
      id: session.user.id,
      limit: 15,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const teamId = rawTeamId ? z.string().uuid().safeParse(rawTeamId) : null;
    if (rawTeamId && !teamId?.success)
      return new Response("Invalid team", { status: 400 });
    const access = await resolveStripeScope(
      session.user.id,
      teamId?.success ? teamId.data : null,
    );
    if (!access.ok) return new Response("Forbidden", { status: 403 });
    const snapshot = await loadStripeSnapshot(access.scope);
    if (!snapshot)
      return Response.json(
        { error: "Stripe is not connected" },
        { status: 404 },
      );
    return Response.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "stripe_auth"
        ? "Stripe rejected this key. Check its permissions and try again."
        : "Unable to load Stripe financial data";
    return Response.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
