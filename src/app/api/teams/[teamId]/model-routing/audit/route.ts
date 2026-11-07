import { getSession } from "auth/server";
import { teamModelRoutingRepository, teamRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

type AuditCursor = { id: string; createdAt: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(value: string | null): { id: string; createdAt: Date } | null | false {
  if (!value) return null;
  if (value.length > 256) return false;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuditCursor>;
    if (typeof decoded.id !== "string" || !UUID.test(decoded.id)) return false;
    if (typeof decoded.createdAt !== "string") return false;
    const createdAt = new Date(decoded.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return false;
    return { id: decoded.id, createdAt };
  } catch {
    return false;
  }
}

function encodeCursor(cursor: { id: string; createdAt: Date }): string {
  return Buffer.from(JSON.stringify({
    id: cursor.id,
    createdAt: cursor.createdAt.toISOString(),
  } satisfies AuditCursor)).toString("base64url");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { teamId } = await params;
  const [team, member] = await Promise.all([
    teamRepository.getTeam(teamId),
    teamRepository.getTeamMember(teamId, session.user.id),
  ]);
  if (!team || !member) return new Response("Not found", { status: 404 });
  if (team.ownerId !== session.user.id && member.role !== "owner" && member.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "Limit must be an integer between 1 and 100." }, { status: 400 });
  }
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === false) return Response.json({ error: "Invalid audit cursor." }, { status: 400 });

  let rows: Awaited<ReturnType<typeof teamModelRoutingRepository.listAudits>>;
  try {
    rows = await teamModelRoutingRepository.listAudits(teamId, { limit, cursor: cursor ?? undefined });
  } catch {
    return Response.json({ error: "Routing audit is temporarily unavailable." }, { status: 503 });
  }
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return Response.json({
    items: page.map((row) => ({
      id: row.id,
      taskKey: row.taskKey,
      selectedProvider: row.selectedProvider,
      selectedModel: row.selectedModel,
      reasonCode: row.reasonCode,
      createdAt: row.createdAt,
    })),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  });
}
