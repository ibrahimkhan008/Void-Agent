import { withAuth } from "auth/route-guard";
import { bugReportRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Reports carry up to ~50k chars of free text across fields (description +
// steps + impact + PoC); 256 KiB bounds the request without rejecting any
// payload the schema below would accept.
const MAX_BODY_BYTES = 256 * 1024;

const CATEGORIES = [
  "security",
  "ui-ux",
  "performance",
  "data-loss",
  "auth",
  "billing",
  "ai-output",
  "mcp",
  "build",
  "other",
] as const;

const CreateBugReportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, "Title must be at least 8 characters")
    .max(160, "Title must be 160 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(20, "Description must be at least 20 characters")
    .max(20_000, "Description must be 20,000 characters or fewer"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.enum(CATEGORIES).optional().default("other"),
  affectedArea: z
    .string()
    .trim()
    .max(200, "Affected area must be 200 characters or fewer")
    .optional()
    .nullable(),
  reproductionSteps: z
    .string()
    .trim()
    .max(10_000, "Reproduction steps must be 10,000 characters or fewer")
    .optional()
    .default(""),
  impact: z
    .string()
    .trim()
    .max(10_000, "Impact must be 10,000 characters or fewer")
    .optional()
    .default(""),
  proofOfConcept: z
    .string()
    .trim()
    .max(10_000, "Proof of concept must be 10,000 characters or fewer")
    .optional()
    .nullable(),
});

async function readJson(request: Request) {
  const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  if (!bytes) return { tooLarge: true as const };
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { invalid: true as const };
  }
}

export const GET = withAuth(async (_request, session) => {
  try {
    // Owner-scoped: reporters only ever see their own reports.
    const reports = await bugReportRepository.listByUser(session.user.id);
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[BugBounty] list error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
});

export const POST = withAuth(async (req, session) => {
  if (!hasSameOrigin(req))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await readJson(req);
    if ("tooLarge" in body)
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413 },
      );
    if ("invalid" in body)
      return NextResponse.json(
        { error: "Invalid payload", issues: null },
        { status: 400 },
      );

    const parsed = CreateBugReportSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const report = await bugReportRepository.create(
      session.user.id,
      parsed.data,
    );
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    console.error("[BugBounty] create error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
});
