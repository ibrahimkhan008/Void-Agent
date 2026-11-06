import { getSession } from "auth/server";
import { driveFileApprovalSchema } from "lib/ai/tools/hitl/drive-file-approval";
import { driveApprovalRepository } from "lib/db/pg/repositories/drive-approval-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  } catch { return new Response("Forbidden", { status: 403 }); }
  const rate = await checkApiRateLimit({ kind: "drive-file-approval", id: session.user.id, limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 52_000);
  if (!body.ok) return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", { status: body.tooLarge ? 413 : 400 });
  const parsed = driveFileApprovalSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Invalid Drive file approval" }, { status: 400 });
  try {
    const approvalToken = await driveApprovalRepository.issue(session.user.id, parsed.data);
    return Response.json({ approvalToken }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not record Drive approval" }, { status: 503 }); }
}
