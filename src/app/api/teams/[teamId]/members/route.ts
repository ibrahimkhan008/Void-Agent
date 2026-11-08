import { getSession } from "auth/server";
import { and, eq, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { TeamMemberTable, TeamTable, UserTable } from "lib/db/pg/schema.pg";
import { teamRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  // Team administrators are intentionally not assignable through this route.
  role: z.enum(["member", "viewer"]).default("member"),
});
const privateHeaders = { "Cache-Control": "private, no-store" };
const failure = (status: number, message: string) =>
  new Response(message, { status, headers: privateHeaders });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  if (!hasSameOrigin(request)) return failure(403, "Forbidden");
  const session = await getSession();
  if (!session?.user.id) return failure(401, "Unauthorized");

  const { teamId } = await params;
  if (!z.string().uuid().safeParse(teamId).success) {
    return failure(404, "Not found");
  }
  const [team] = await pgDb
    .select({ id: TeamTable.id, ownerId: TeamTable.ownerId })
    .from(TeamTable)
    .where(eq(TeamTable.id, teamId));
  if (!team) return failure(404, "Not found");

  // Look up the caller's own membership separately. Never infer their access
  // from another member row or from a client-supplied role.
  const [callerMembership] = await pgDb
    .select({ role: TeamMemberTable.role })
    .from(TeamMemberTable)
    .where(
      // Keep both keys in the query so a caller cannot authorize against a
      // membership belonging to a different user.
      and(
        eq(TeamMemberTable.teamId, teamId),
        eq(TeamMemberTable.userId, session.user.id),
      ),
    );
  const isOwner = team.ownerId === session.user.id;
  if (!isOwner && !callerMembership) return failure(404, "Not found");
  if (!isOwner && callerMembership?.role !== "admin") {
    return failure(403, "Forbidden");
  }

  const limit = await checkApiRateLimit({
    kind: "team_member_add",
    id: `${teamId}:${session.user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many member additions. Try again shortly." },
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
  if (!body.ok)
    return Response.json(
      { error: body.error },
      { status: body.status, headers: privateHeaders },
    );
  const parsed = addMemberSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid team member" },
      { status: 400, headers: privateHeaders },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const [target] = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(sql`lower(${UserTable.email}) = ${email}`);
  if (!target) {
    return Response.json(
      { error: "The user must have an account before they can be added." },
      { status: 404, headers: privateHeaders },
    );
  }
  if (target.id === team.ownerId) {
    return Response.json(
      { error: "The team owner is already a member." },
      { status: 409, headers: privateHeaders },
    );
  }

  const [existingMembership] = await pgDb
    .select({ id: TeamMemberTable.id })
    .from(TeamMemberTable)
    .where(
      and(
        eq(TeamMemberTable.teamId, teamId),
        eq(TeamMemberTable.userId, target.id),
      ),
    );
  if (existingMembership) {
    return Response.json(
      { error: "The user is already a team member." },
      { status: 409, headers: privateHeaders },
    );
  }

  const member = await teamRepository.createTeamMember(
    teamId,
    target.id,
    parsed.data.role,
  );
  if (!member) {
    return Response.json(
      { error: "The user is already a team member." },
      { status: 409, headers: privateHeaders },
    );
  }
  return Response.json(
    { member: { userId: member.userId, role: member.role } },
    { status: 201, headers: privateHeaders },
  );
}
