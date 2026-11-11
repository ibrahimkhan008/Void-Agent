import { connectorActionApprovalSchema } from "lib/ai/tools/hitl/connector-action-approval";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { hasSameOrigin } from "lib/security/same-origin";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = await checkApiRateLimit({
    kind: "connector-action-approval",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many approval requests" },
      { status: 429 },
    );
  }
  const body = await readBoundedJson(request, 20_000);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.tooLarge ? "Request too large" : "Invalid request" },
      { status: body.tooLarge ? 413 : 400 },
    );
  }
  const payload = connectorActionApprovalSchema.safeParse(body.value);
  if (!payload.success) {
    return NextResponse.json(
      { error: "Connector action cannot be approved" },
      { status: 400 },
    );
  }
  try {
    const approvalToken = await connectorActionApprovalRepository.issue(
      session.user.id,
      payload.data,
    );
    return NextResponse.json(
      { approvalToken, expiresInSeconds: 300 },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not prepare this approval" },
      { status: 503 },
    );
  }
});
