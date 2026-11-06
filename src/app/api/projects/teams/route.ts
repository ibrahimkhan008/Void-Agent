import { getSession } from "auth/server";
import { listProjectTeamsForUser } from "lib/projects/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const teams = await listProjectTeamsForUser(session.user.id);
  return Response.json({ teams });
}
