import { getSession } from "auth/server";
import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { SessionTable } from "lib/db/pg/schema.pg";
import { teamRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { z } from "zod";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ teamId: z.string().uuid().nullable() });
const failure = (status: number, error: string) =>
  Response.json({ error }, { status, headers: privateHeaders });

export async function GET() {
  const session = await getSession({ disableCookieCache: true });
  if (!session?.user.id) return failure(401, "Unauthorized");
  const activeTeamId = session.session.activeTeamId;
  if (!activeTeamId) {
    return Response.json({ activeTeamId: null }, { headers: privateHeaders });
  }
  const membership = await teamRepository.getTeamMember(
    activeTeamId,
    session.user.id,
  );
  if (!membership) {
    await pgDb
      .update(SessionTable)
      .set({ activeTeamId: null, updatedAt: new Date() })
      .where(
        and(
          eq(SessionTable.id, session.session.id),
          eq(SessionTable.userId, session.user.id),
        ),
      );
    return Response.json({ activeTeamId: null }, { headers: privateHeaders });
  }
  return Response.json({ activeTeamId }, { headers: privateHeaders });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return failure(403, "Forbidden");
  const session = await getSession({ disableCookieCache: true });
  if (!session?.user.id) return failure(401, "Unauthorized");
  const limit = await checkApiRateLimit({
    kind: "active_team_select",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many team changes. Try again shortly." },
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
  if (!parsed.success) return failure(400, "Invalid active team selection");
  if (parsed.data.teamId) {
    const membership = await teamRepository.getTeamMember(
      parsed.data.teamId,
      session.user.id,
    );
    if (!membership) return failure(404, "Team not found");
  }
  const [updated] = await pgDb
    .update(SessionTable)
    .set({ activeTeamId: parsed.data.teamId, updatedAt: new Date() })
    .where(
      and(
        eq(SessionTable.id, session.session.id),
        eq(SessionTable.userId, session.user.id),
      ),
    )
    .returning({
      id: SessionTable.id,
      activeTeamId: SessionTable.activeTeamId,
    });
  if (!updated) return failure(409, "Session could not be updated");
  return Response.json(
    { activeTeamId: updated.activeTeamId },
    { headers: privateHeaders },
  );
}
