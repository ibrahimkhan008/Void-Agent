import { bugReportRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { hasSameOrigin } from "lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Comment bodies cap at 10k chars; 48 KiB bounds the request without
// rejecting any body the schema below would accept.
const MAX_BODY_BYTES = 48 * 1024;

const AddCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(10_000, "Comment must be 10,000 characters or fewer"),
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
      const report = await bugReportRepository.getByIdForUser(
        id,
        session.user.id,
      );
      if (!report) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // Reporters never see internal triage notes.
      const comments = await bugReportRepository.listComments(id, {
        includeInternal: false,
      });
      return NextResponse.json(
        { comments },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (err) {
      console.error("[BugBounty] list comments error", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  },
);

export const POST = withAuth(
  async (req: NextRequest, session, ctx: RouteContext) => {
    if (!hasSameOrigin(req))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
      const { id } = await ctx.params;
      const report = await bugReportRepository.getByIdForUser(
        id,
        session.user.id,
      );
      if (!report) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
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

      const parsed = AddCommentSchema.safeParse(body.value);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const comment = await bugReportRepository.addComment({
        reportId: id,
        userId: session.user.id,
        body: parsed.data.body,
        isInternal: false,
      });
      return NextResponse.json({ comment }, { status: 201 });
    } catch (err) {
      console.error("[BugBounty] add comment error", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  },
);
