import { getSession } from "auth/server";
import { teamInvitationRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
const bodySchema = z.object({ token: z.string().min(32).max(128) });
const failure = (status: number, error: string) =>
  Response.json({ error }, { status, headers: privateHeaders });

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return failure(403, "Forbidden");
  const session = await getSession();
  if (!session?.user.id)
    return failure(401, "Sign in to accept this invitation.");
  const limit = await checkApiRateLimit({
    kind: "team_invitation_accept",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again shortly." },
      {
        status: 429,
        headers: {
          ...privateHeaders,
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }
  const body = await readBoundedJsonRequest(request, 512);
  if (!body.ok) return failure(body.status, body.error);
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "Invalid or expired invitation.");
  const result = await teamInvitationRepository.accept({
    token: parsed.data.token,
    userId: session.user.id,
  });
  if (result.status === "accepted") {
    return Response.json(
      { accepted: true, teamId: result.teamId },
      { status: 200, headers: privateHeaders },
    );
  }
  if (result.status === "already-member") {
    return failure(409, "This account already belongs to the team.");
  }
  return failure(400, "Invalid or expired invitation for this account.");
}
