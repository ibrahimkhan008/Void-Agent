import { randomUUID } from "node:crypto";
import { requireBillingContext } from "@/lib/gate";
import { withAuth } from "auth/route-guard";
import { executeAppBuild } from "lib/ai/app-build-runner";
import { isAppBuilderConfigured } from "lib/ai/app-builder";
import { pgAppBuildRepository } from "lib/db/pg/repositories/app-build-repository.pg";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse, after } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const createSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  threadId: z.string().uuid(),
  /**
   * "static" (default) is a single generation pass; "agent" runs a bounded
   * multi-pass refine loop before provisioning. "vibesdk" is accepted for
   * API-shape parity with the original builder but this deployment has no
   * VibeSDK integration, so it is rejected below with a stable error code.
   */
  mode: z.enum(["static", "agent", "vibesdk"]).default("static"),
});

export const GET = withAuth(async (_request, session) => {
  try {
    const builds = await pgAppBuildRepository.listForOwner(session.user.id);
    return NextResponse.json(
      {
        builds: builds.map(
          ({ files: _files, prompt: _prompt, buildLog: _buildLog, ...build }) =>
            build,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error(
      "App build list failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Could not load builds" },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAppBuilderConfigured()) {
    return NextResponse.json(
      { error: "App builder is unavailable" },
      { status: 503 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid build request" },
      { status: 400 },
    );
  }
  if (parsed.data.mode === "vibesdk") {
    return NextResponse.json(
      {
        error: "vibesdk-unavailable",
        message: "VibeSDK builds are not available on this deployment.",
      },
      { status: 503 },
    );
  }

  const rate = await checkApiRateLimit({
    kind: "app-builder",
    id: session.user.id,
    limit: 3,
    windowMs: 60_000,
  }).catch(() => null);
  if (!rate) {
    return NextResponse.json(
      { error: "Builds are temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!rate.allowed) {
    return NextResponse.json({ error: "Build limit reached" }, { status: 429 });
  }

  try {
    const billing = await requireBillingContext();
    const admission = await pgAppBuildRepository.createIfCapacity({
      userId: session.user.id,
      threadId: parsed.data.threadId,
      prompt: parsed.data.prompt,
      id: randomUUID(),
      activeLimit: 2,
    });
    if (admission.status === "thread_not_found") {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (admission.status === "active_limit") {
      return NextResponse.json(
        { error: "You already have two active builds" },
        { status: 429 },
      );
    }
    const { build } = admission;

    // Next's after() keeps the bounded build task alive after the 202 response.
    // The stage/status is persisted so polling remains functional across
    // reconnects and process instances.
    after(async () => {
      try {
        await executeAppBuild({
          buildId: build.id,
          userId: session.user.id,
          threadId: parsed.data.threadId,
          prompt: parsed.data.prompt,
          customerId: billing.customerId,
          entityId: billing.entityId,
          mode: parsed.data.mode === "agent" ? "agent" : "static",
        });
      } catch (error) {
        logger.error(
          "App build execution failed",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    });

    return NextResponse.json(
      { buildId: build.id, status: build.status },
      { status: 202 },
    );
  } catch (error) {
    logger.error(
      "App build admission failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Could not start the app build" },
      { status: 500 },
    );
  }
});
