import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { getBaseUrl } from "lib/const";
import { pgDb } from "lib/db/pg/db.pg";
import { TeamMemberTable, TeamTable } from "lib/db/pg/schema.pg";
import { teamInvitationRepository } from "lib/db/repository";
import { sendTeamInvitationEmail } from "lib/email/team-invitation-email";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import {
  TEAM_INVITATION_TTL_MS,
  createTeamInvitationToken,
  hashTeamInvitationEmail,
  hashTeamInvitationToken,
  normalizeInvitationEmail,
} from "lib/team-invitations";
import { z } from "zod";

export const dynamic = "force-dynamic";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
const invitationSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["member", "viewer"]).default("member"),
});
const failure = (status: number, error: string) =>
  Response.json({ error }, { status, headers: privateHeaders });

async function canManageTeam(teamId: string, userId: string) {
  const [team] = await pgDb
    .select({
      id: TeamTable.id,
      ownerId: TeamTable.ownerId,
      name: TeamTable.name,
    })
    .from(TeamTable)
    .where(eq(TeamTable.id, teamId));
  if (!team) return null;
  const [membership] = await pgDb
    .select({ role: TeamMemberTable.role })
    .from(TeamMemberTable)
    .where(
      and(
        eq(TeamMemberTable.teamId, teamId),
        eq(TeamMemberTable.userId, userId),
      ),
    );
  const isManager = team.ownerId === userId || membership?.role === "admin";
  return { team, isManager };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return failure(401, "Unauthorized");
  const { teamId } = await params;
  if (!z.string().uuid().safeParse(teamId).success)
    return failure(404, "Not found");
  const access = await canManageTeam(teamId, session.user.id);
  if (!access) return failure(404, "Not found");
  if (!access.isManager) return failure(403, "Forbidden");
  const invitations = await teamInvitationRepository.list(teamId);
  return Response.json(
    {
      invitations,
    },
    { headers: privateHeaders },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  if (!hasSameOrigin(request)) return failure(403, "Forbidden");
  const session = await getSession();
  if (!session?.user.id) return failure(401, "Unauthorized");
  const { teamId } = await params;
  if (!z.string().uuid().safeParse(teamId).success)
    return failure(404, "Not found");
  const access = await canManageTeam(teamId, session.user.id);
  if (!access) return failure(404, "Not found");
  if (!access.isManager) return failure(403, "Forbidden");
  const limit = await checkApiRateLimit({
    kind: "team_invitation_create",
    id: `${teamId}:${session.user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many invitations. Try again shortly." },
      {
        status: 429,
        headers: {
          ...privateHeaders,
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }
  const body = await readBoundedJsonRequest(request, 2_048);
  if (!body.ok) return failure(body.status, body.error);
  const parsed = invitationSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "Invalid team invitation");
  const email = normalizeInvitationEmail(parsed.data.email);
  const recipientLimit = await checkApiRateLimit({
    kind: "team_invitation_recipient",
    id: hashTeamInvitationEmail(email),
    limit: 5,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!recipientLimit.allowed) {
    return Response.json(
      { error: "Too many invitations have been sent to this address." },
      {
        status: 429,
        headers: {
          ...privateHeaders,
          "Retry-After": String(Math.ceil(recipientLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) return failure(503, "Invitation URL is not configured");
  const origin = new URL(baseUrl);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    return failure(503, "Secure invitation URL is not configured");
  }

  const token = createTeamInvitationToken();
  const expiresAt = new Date(Date.now() + TEAM_INVITATION_TTL_MS);
  const result = await teamInvitationRepository.create({
    teamId,
    inviterId: session.user.id,
    email,
    role: parsed.data.role,
    tokenHash: hashTeamInvitationToken(token),
    expiresAt,
  });
  if (result.status === "not-found") return failure(404, "Not found");
  if (result.status === "forbidden") return failure(403, "Forbidden");
  if (result.status !== "created")
    return failure(500, "Could not create invitation");

  const acceptUrl = new URL("/team-invitations/accept", origin);
  acceptUrl.hash = new URLSearchParams({ token }).toString();
  const deliveryStatus = await sendTeamInvitationEmail({
    to: result.invitation.email,
    teamName: access.team.name,
    inviterName: session.user.name ?? "",
    acceptUrl: acceptUrl.toString(),
  });
  return Response.json(
    {
      invitation: result.invitation,
      acceptUrl: acceptUrl.toString(),
      deliveryStatus,
    },
    { status: 201, headers: privateHeaders },
  );
}
