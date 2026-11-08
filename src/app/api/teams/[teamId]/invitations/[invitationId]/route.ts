import { getSession } from "auth/server";
import { teamInvitationRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
const failure = (status: number, error: string) =>
  Response.json({ error }, { status, headers: privateHeaders });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string; invitationId: string }> },
) {
  if (!hasSameOrigin(request)) return failure(403, "Forbidden");
  const session = await getSession();
  if (!session?.user.id) return failure(401, "Unauthorized");
  const { teamId, invitationId } = await params;
  if (
    !z.string().uuid().safeParse(teamId).success ||
    !z.string().uuid().safeParse(invitationId).success
  ) {
    return failure(404, "Not found");
  }
  const limit = await checkApiRateLimit({
    kind: "team_invitation_revoke",
    id: `${teamId}:${session.user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many invitation changes. Try again shortly." },
      {
        status: 429,
        headers: {
          ...privateHeaders,
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }
  const result = await teamInvitationRepository.revoke({
    teamId,
    invitationId,
    actorId: session.user.id,
  });
  if (result.status === "not-found") return failure(404, "Not found");
  if (result.status === "forbidden") return failure(403, "Forbidden");
  if (result.status !== "revoked")
    return failure(409, "Invitation is no longer pending");
  return Response.json({ revoked: true }, { headers: privateHeaders });
}
