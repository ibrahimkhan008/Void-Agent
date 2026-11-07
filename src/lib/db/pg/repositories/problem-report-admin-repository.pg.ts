import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProblemReportTable } from "lib/db/pg/schema.pg";

export const problemReportStatuses = ["open", "in_review", "resolved"] as const;
export type ProblemReportStatus = (typeof problemReportStatuses)[number];

export interface ProblemReportAdminQuery {
  limit: number;
  offset: number;
  status?: ProblemReportStatus;
}

export function publicAdminScreenshotMetadata(
  screenshots:
    | { key: string; name: string; contentType: string; size: number }[]
    | null,
) {
  return Array.isArray(screenshots)
    ? screenshots.map(({ name, contentType, size }) => ({
        name,
        contentType,
        size,
      }))
    : [];
}

export function publicAdminContext(context: unknown) {
  if (!context || typeof context !== "object" || Array.isArray(context))
    return null;
  const value = context as Record<string, unknown>;
  let pageUrl: string | undefined;
  if (typeof value.pageUrl === "string") {
    try {
      const parsed = new URL(value.pageUrl);
      parsed.search = "";
      parsed.hash = "";
      pageUrl = parsed.toString().slice(0, 2_048);
    } catch {
      // Ignore invalid legacy URLs rather than returning potentially sensitive input.
    }
  }
  return {
    ...(pageUrl ? { pageUrl } : {}),
    ...(typeof value.userAgent === "string"
      ? { userAgent: value.userAgent.slice(0, 512) }
      : {}),
    ...(typeof value.locale === "string"
      ? { locale: value.locale.slice(0, 16) }
      : {}),
    ...(typeof value.viewport === "string"
      ? { viewport: value.viewport.slice(0, 32) }
      : {}),
  };
}

/** Admin projection deliberately omits screenshot storage keys and user credentials. */
export async function listProblemReports({
  limit,
  offset,
  status,
}: ProblemReportAdminQuery) {
  const conditions = status ? [eq(ProblemReportTable.status, status)] : [];
  const reports = await pgDb
    .select({
      id: ProblemReportTable.id,
      userId: ProblemReportTable.userId,
      description: ProblemReportTable.description,
      screenshots: ProblemReportTable.screenshots,
      context: ProblemReportTable.context,
      status: ProblemReportTable.status,
      createdAt: ProblemReportTable.createdAt,
      updatedAt: ProblemReportTable.updatedAt,
    })
    .from(ProblemReportTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(ProblemReportTable.createdAt), desc(ProblemReportTable.id))
    .limit(limit + 1)
    .offset(offset);

  return {
    reports: reports
      .slice(0, limit)
      .map(({ screenshots, context, ...report }) => ({
        ...report,
        screenshots: publicAdminScreenshotMetadata(screenshots),
        context: publicAdminContext(context),
      })),
    hasMore: reports.length > limit,
  };
}

export async function updateProblemReportStatus(
  id: string,
  status: ProblemReportStatus,
) {
  const [report] = await pgDb
    .update(ProblemReportTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ProblemReportTable.id, id))
    .returning({
      id: ProblemReportTable.id,
      status: ProblemReportTable.status,
      updatedAt: ProblemReportTable.updatedAt,
    });
  return report ?? null;
}
