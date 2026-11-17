import {
  disableCodeReview,
  enableCodeReview,
  removeCodeReview,
} from "@/lib/code-review/provision";
import {
  CODE_REVIEW_TRIGGERS,
  codeReviewRepository,
} from "@/lib/db/pg/repositories/code-review-repository.pg";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;

/**
 * PUT /api/code-review/settings/[repository] — save the per-repo settings
 * and (de)provision the pipeline. `autoReview: true` provisions the GitHub
 * webhook through the Void Hooks pipeline (endpoint + reviewer agent +
 * repo webhook); `false` tears the webhook down and disables the endpoint.
 */
export const PUT = withAuth(
  async (
    request,
    session,
    context?: { params?: Promise<{ repository: string }> },
  ) => {
    const params = (await context?.params) ?? { repository: "" };
    const repository = decodeURIComponent(params.repository ?? "");
    const userId = session.user.id;
    if (!REPOSITORY_PATTERN.test(repository)) {
      return NextResponse.json(
        { error: "repository must be owner/repo" },
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => null)) as {
      autoReview?: boolean;
      reviewTrigger?: string | null;
      exhaustiveReview?: boolean | null;
      reviewInstructions?: string | null;
    } | null;
    if (!body || typeof body.autoReview !== "boolean") {
      return NextResponse.json(
        { error: "autoReview is required" },
        { status: 400 },
      );
    }
    if (
      body.reviewTrigger !== undefined &&
      body.reviewTrigger !== null &&
      !(CODE_REVIEW_TRIGGERS as string[]).includes(body.reviewTrigger)
    ) {
      return NextResponse.json(
        {
          error:
            "reviewTrigger must be one of pr_open, every_push, smart_detect or null",
        },
        { status: 400 },
      );
    }
    if (
      body.reviewInstructions !== undefined &&
      body.reviewInstructions !== null &&
      (typeof body.reviewInstructions !== "string" ||
        body.reviewInstructions.trim().length === 0 ||
        body.reviewInstructions.length > 4000)
    ) {
      return NextResponse.json(
        { error: "reviewInstructions must be 1-4000 characters" },
        { status: 400 },
      );
    }

    const config = {
      autoReview: body.autoReview,
      reviewTrigger: (body.reviewTrigger as never) ?? null,
      exhaustiveReview: body.exhaustiveReview ?? null,
      reviewInstructions: body.reviewInstructions ?? null,
    };

    try {
      let provisioned = false;
      if (body.autoReview) {
        const { webhookId } = await enableCodeReview(
          userId,
          repository,
          config,
        );
        provisioned = webhookId !== null;
      } else {
        await disableCodeReview(userId, repository);
      }
      const setting = await codeReviewRepository.getRepoSetting(
        userId,
        repository,
      );
      return NextResponse.json({
        setting: {
          repository,
          autoReview: setting?.autoReview ?? false,
          reviewTrigger: setting?.reviewTrigger ?? null,
          exhaustiveReview: setting?.exhaustiveReview ?? null,
          reviewInstructions: setting?.reviewInstructions ?? null,
          provisioned,
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not update code review settings",
        },
        { status: 502 },
      );
    }
  },
);

/**
 * DELETE /api/code-review/settings/[repository] — tear the pipeline down
 * and forget the repository's settings entirely.
 */
export const DELETE = withAuth(
  async (
    _request,
    session,
    context?: { params?: Promise<{ repository: string }> },
  ) => {
    const params = (await context?.params) ?? { repository: "" };
    const repository = decodeURIComponent(params.repository ?? "");
    const userId = session.user.id;
    if (!REPOSITORY_PATTERN.test(repository)) {
      return NextResponse.json(
        { error: "repository must be owner/repo" },
        { status: 400 },
      );
    }
    try {
      await removeCodeReview(userId, repository);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not remove code review settings",
        },
        { status: 502 },
      );
    }
  },
);
