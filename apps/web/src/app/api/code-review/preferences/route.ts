import {
  CODE_REVIEW_TRIGGERS,
  type CodeReviewTrigger,
  codeReviewRepository,
} from "@/lib/db/pg/repositories/code-review-repository.pg";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

/** GET /api/code-review/preferences — the user-level review defaults. */
export const GET = withAuth(async (_request, session) => {
  const prefs = await codeReviewRepository.getUserPrefs(session.user.id);
  return NextResponse.json({
    reviewTrigger: prefs.reviewTrigger,
    exhaustiveReview: prefs.exhaustiveReview,
  });
});

/** PUT /api/code-review/preferences — update the user-level defaults. */
export const PUT = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as {
    reviewTrigger?: string;
    exhaustiveReview?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    body.reviewTrigger !== undefined &&
    !(CODE_REVIEW_TRIGGERS as string[]).includes(body.reviewTrigger)
  ) {
    return NextResponse.json(
      {
        error: "reviewTrigger must be one of pr_open, every_push, smart_detect",
      },
      { status: 400 },
    );
  }
  if (
    body.exhaustiveReview !== undefined &&
    typeof body.exhaustiveReview !== "boolean"
  ) {
    return NextResponse.json(
      { error: "exhaustiveReview must be a boolean" },
      { status: 400 },
    );
  }
  const prefs = await codeReviewRepository.updateUserPrefs(session.user.id, {
    reviewTrigger: body.reviewTrigger as CodeReviewTrigger | undefined,
    exhaustiveReview: body.exhaustiveReview,
  });
  return NextResponse.json({
    reviewTrigger: prefs.reviewTrigger,
    exhaustiveReview: prefs.exhaustiveReview,
  });
});
