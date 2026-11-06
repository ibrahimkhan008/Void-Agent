import { getSession } from "auth/server";
import { publishedPageRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pages = await publishedPageRepository.selectByOwner(session.user.id);
    return Response.json(
      { pages },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load published pages" },
      { status: 500 },
    );
  }
}
