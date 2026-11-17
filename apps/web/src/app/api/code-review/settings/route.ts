import { codeReviewRepository } from "@/lib/db/pg/repositories/code-review-repository.pg";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

/** GET /api/code-review/settings — every configured repository for the user. */
export const GET = withAuth(async (_request, session) => {
  const settings = await codeReviewRepository.listRepoSettings(session.user.id);
  return NextResponse.json({
    settings: settings.map((setting) => ({
      repository: setting.repository,
      autoReview: setting.autoReview,
      reviewTrigger: setting.reviewTrigger,
      exhaustiveReview: setting.exhaustiveReview,
      reviewInstructions: setting.reviewInstructions,
      provisioned: setting.webhookId !== null,
    })),
  });
});
