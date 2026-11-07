import { getSession } from "auth/server";
import { desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProblemReportTable } from "lib/db/pg/schema.pg";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { isUserStorageKey, storageKeyFromUrl } from "lib/file-storage/storage-utils";
import { problemReportInputSchema } from "../../../types/problem-report";

export const dynamic = "force-dynamic";
const MAX_REPORT_BODY_BYTES = 16 * 1024;
const REPORT_HISTORY_LIMIT = 50;

function safeContext(
  context: ReturnType<typeof problemReportInputSchema.parse>["context"],
  request: Request,
) {
  if (!context) return null;
  let pageUrl: string | undefined;
  if (context.pageUrl) {
    try {
      const supplied = new URL(context.pageUrl);
      if (supplied.origin === new URL(request.url).origin) {
        supplied.search = "";
        supplied.hash = "";
        pageUrl = supplied.toString().slice(0, 2_048);
      }
    } catch {
      pageUrl = undefined;
    }
  }
  return {
    ...(pageUrl ? { pageUrl } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    ...(context.locale ? { locale: context.locale } : {}),
    ...(context.viewport ? { viewport: context.viewport } : {}),
  };
}

function screenshotUrl(key: string) {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const reports = await pgDb
      .select({
        id: ProblemReportTable.id,
        description: ProblemReportTable.description,
        screenshots: ProblemReportTable.screenshots,
        status: ProblemReportTable.status,
        createdAt: ProblemReportTable.createdAt,
        updatedAt: ProblemReportTable.updatedAt,
      })
      .from(ProblemReportTable)
      .where(eq(ProblemReportTable.userId, session.user.id))
      .orderBy(desc(ProblemReportTable.createdAt))
      .limit(REPORT_HISTORY_LIMIT);
    return Response.json(
      {
        reports: reports.map((report) => ({
          ...report,
          screenshots: report.screenshots.map((shot) => ({
            name: shot.name,
            contentType: shot.contentType,
            size: shot.size,
            url: screenshotUrl(shot.key),
          })),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Unable to load reports" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "problem-report-create",
    id: session.user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJsonRequest(request, MAX_REPORT_BODY_BYTES);
  if (!body.ok)
    return Response.json({ error: body.error }, { status: body.status });
  const parsed = problemReportInputSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json({ error: "Invalid report" }, { status: 400 });
  const screenshots = parsed.data.screenshots;
  const keys = new Set<string>();
  for (const shot of screenshots) {
    const keyFromUrl = storageKeyFromUrl(`/api/files/${shot.key}`);
    if (
      !isUserStorageKey(shot.key, session.user.id) ||
      keyFromUrl !== shot.key ||
      keys.has(shot.key)
    ) {
      return Response.json({ error: "Invalid screenshot attachment" }, { status: 400 });
    }
    keys.add(shot.key);
  }
  try {
    const [report] = await pgDb
      .insert(ProblemReportTable)
      .values({
        userId: session.user.id,
        description: parsed.data.description,
        screenshots,
        context: safeContext(parsed.data.context, request),
      })
      .returning({ id: ProblemReportTable.id, status: ProblemReportTable.status });
    if (!report) throw new Error("Report insert returned no row");
    return Response.json(report, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to submit report" }, { status: 503 });
  }
}
