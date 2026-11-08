import { getSession } from "auth/server";
import { resolveStripeScope } from "lib/cockpit/access";
import { loadVercelSnapshot, publicVercelError } from "lib/cockpit/vercel";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  try {
    const rate = await checkApiRateLimit({
      kind: "cockpit-vercel-deployments",
      id: session.user.id,
      limit: 15,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", {
        status: 429,
        headers: noStore,
      });
    const rawTeamId = new URL(request.url).searchParams.get("teamId");
    const parsedTeamId = rawTeamId
      ? z.string().uuid().safeParse(rawTeamId)
      : null;
    if (rawTeamId && !parsedTeamId?.success)
      return new Response("Invalid team", { status: 400, headers: noStore });
    const access = await resolveStripeScope(
      session.user.id,
      parsedTeamId?.success ? parsedTeamId.data : null,
    );
    if (!access.ok)
      return new Response("Forbidden", { status: 403, headers: noStore });
    const snapshot = await loadVercelSnapshot(access.scope);
    if (!snapshot)
      return Response.json(
        { error: "Vercel is not connected" },
        { status: 404, headers: noStore },
      );
    return Response.json(snapshot, { headers: noStore });
  } catch (error) {
    return Response.json(
      { error: publicVercelError(error) },
      { status: 502, headers: noStore },
    );
  }
}
