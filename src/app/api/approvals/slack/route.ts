import { getSession } from "auth/server";
import { slackMessageApprovalSchema } from "lib/ai/tools/hitl/slack-approval";
import { slackApprovalRepository } from "lib/db/pg/repositories/slack-approval-repository.pg";
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
  const rate = await checkApiRateLimit({ kind: "slack-message-approval", id: session.user.id, limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 8_000);
  if (!body.ok) return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", { status: body.tooLarge ? 413 : 400 });
  const parsed = slackMessageApprovalSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Invalid Slack message" }, { status: 400 });
  try {
    const approvalToken = await slackApprovalRepository.issue(session.user.id, parsed.data);
    return Response.json({ approvalToken }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not record Slack approval" }, { status: 503 }); }
}
