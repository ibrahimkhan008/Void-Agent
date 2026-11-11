import { withAuth } from "auth/route-guard";
import { clarifyAppPrompt } from "lib/ai/app-builder";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

// POST /api/build/clarify — ask whether a prompt is specific enough to build,
// and get back questions if it is not. Text-only model call: no sandbox is
// created, so this is cheap and safe to call before every build.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clarifySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = clarifySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid clarify request" },
      { status: 400 },
    );
  }

  const rate = await checkApiRateLimit({
    kind: "app-builder",
    id: session.user.id,
    limit: 12,
    windowMs: 60_000,
  }).catch(() => null);
  if (!rate) {
    return NextResponse.json(
      { error: "Clarify is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Clarify limit reached" },
      { status: 429 },
    );
  }

  try {
    // Never blocks: clarifyAppPrompt answers "ready to build" on any internal
    // failure, so the build path cannot be held hostage by the clarifier.
    const result = await clarifyAppPrompt(
      parsed.data.prompt,
      AbortSignal.timeout(30_000),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error(
      "App build clarify failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Could not check the request" },
      { status: 500 },
    );
  }
});
