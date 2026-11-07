import "server-only";
import { getSession } from "auth/server";
import { requireAdminPermission } from "lib/auth/permissions";
import {
  listProblemReports,
  problemReportStatuses,
} from "lib/db/pg/repositories/problem-report-admin-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const MAX_LIMIT = 50;
const MAX_OFFSET = 10_000;

async function authenticatedAdminId() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  await requireAdminPermission("review problem reports");
  return session.user.id;
}

export async function GET(request: Request) {
  let adminId: string | null;
  try {
    adminId = await authenticatedAdminId();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!adminId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rate = await checkApiRateLimit({
      kind: "admin-problem-report-list",
      id: adminId,
      limit: 60,
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

  const params = new URL(request.url).searchParams;
  const limitRaw = params.get("limit");
  const offsetRaw = params.get("offset");
  const statusRaw = params.get("status");
  const limit = limitRaw === null ? 25 : Number(limitRaw);
  const offset = offsetRaw === null ? 0 : Number(offsetRaw);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > MAX_OFFSET ||
    (statusRaw !== null &&
      !problemReportStatuses.includes(
        statusRaw as (typeof problemReportStatuses)[number],
      ))
  ) {
    return NextResponse.json(
      { error: "Invalid pagination or status filter" },
      { status: 400 },
    );
  }

  try {
    const result = await listProblemReports({
      limit,
      offset,
      ...(statusRaw
        ? { status: statusRaw as (typeof problemReportStatuses)[number] }
        : {}),
    });
    return NextResponse.json(
      { ...result, limit, offset },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load problem reports" },
      { status: 503 },
    );
  }
}
