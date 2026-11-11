import { bugReportRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { hasSameOrigin } from "lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

const UpdateBugReportSchema = z.object({
  title: z.string().trim().min(8).max(160).optional(),
  description: z.string().trim().min(20).max(20_000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  category: z
    .enum([
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
    ])
    .optional(),
  affectedArea: z.string().trim().max(200).nullable().optional(),
  reproductionSteps: z.string().trim().max(10_000).optional(),
  impact: z.string().trim().max(10_000).optional(),
  proofOfConcept: z.string().trim().max(10_000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function readJson(request: Request) {
  const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  if (!bytes) return { tooLarge: true as const };
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { invalid: true as const };
  }
}

export const GET = withAuth(
  async (_req: NextRequest, session, ctx: RouteContext) => {
    try {
      const { id } = await ctx.params;
      // Owner-scoped read: a report is only ever served to its reporter.
      const report = await bugReportRepository.getByIdForUser(
        id,
        session.user.id,
      );
      if (!report) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        { report },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (err) {
      console.error("[BugBounty] get error", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  },
);

export const PATCH = withAuth(
  async (req: NextRequest, session, ctx: RouteContext) => {
    if (!hasSameOrigin(req))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
      const { id } = await ctx.params;
      const existing = await bugReportRepository.getByIdForUser(
        id,
        session.user.id,
      );
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // Reporters can only edit reports that are still in `pending` status.
      if (existing.status !== "pending") {
        return NextResponse.json(
          {
            error: "Report is locked",
            message:
              "Reports can only be edited while they are in the `pending` status. Add a comment to share new information with the triage team.",
          },
          { status: 409 },
        );
      }

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

      const parsed = UpdateBugReportSchema.safeParse(body.value);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const updated = await bugReportRepository.updateByUser(
        id,
        session.user.id,
        parsed.data,
      );
      return NextResponse.json({ report: updated });
    } catch (err) {
      console.error("[BugBounty] patch error", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  },
);

export const DELETE = withAuth(
  async (req: NextRequest, session, ctx: RouteContext) => {
    if (!hasSameOrigin(req))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
      const { id } = await ctx.params;
      const ok = await bugReportRepository.deleteByUser(id, session.user.id);
      if (!ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[BugBounty] delete error", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  },
);
