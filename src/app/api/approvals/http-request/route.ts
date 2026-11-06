import { getSession } from "auth/server";
import { httpRequestApprovalSchema } from "lib/ai/tools/hitl/http-request-approval";
import { httpRequestApprovalRepository } from "lib/db/pg/repositories/http-request-approval-repository.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const rate = await checkApiRateLimit({
    kind: "http-request-approval",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 32_000);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  const parsed = httpRequestApprovalSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid HTTP request approval" },
      { status: 400 },
    );
  try {
    const approvalToken = await httpRequestApprovalRepository.issue(
      session.user.id,
      parsed.data,
    );
    return Response.json(
      { approvalToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not record this HTTP request approval" },
      { status: 503 },
    );
  }
}
