import "server-only";
import { getSession } from "auth/server";
import { requireAdminPermission } from "lib/auth/permissions";
import { updateProblemReportStatus } from "lib/db/pg/repositories/problem-report-admin-repository.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const StatusSchema = z
  .object({ status: z.enum(["open", "in_review", "resolved"]) })
  .strict();
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requireAdminPermission("update problem report status");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
  const body = await readBoundedJsonRequest(request, 1024);
  if (!body.ok)
    return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = StatusSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  try {
    const rate = await checkApiRateLimit({
      kind: "admin-problem-report-status-update",
      id: session.user.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil(rate.retryAfterMs / 1_000)),
            ),
          },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Rate limiting unavailable" },
      { status: 503 },
    );
  }
  try {
    const report = await updateProblemReportStatus(id, parsed.data.status);
    if (!report)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json(
      { report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to update report" },
      { status: 503 },
    );
  }
}
