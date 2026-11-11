import { requireBillingContext } from "@/lib/gate";
import { withAuth } from "auth/route-guard";
import { resumeAppBuild } from "lib/ai/app-build-runner";
import { pgAppBuildRepository } from "lib/db/pg/repositories/app-build-repository.pg";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse, after } from "next/server";

export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );

export const POST = withAuth(async (request, session, { params }: Context) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!validId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rate = await checkApiRateLimit({
    kind: "app-builder",
    id: session.user.id,
    limit: 3,
    windowMs: 60_000,
  }).catch(() => null);
  if (!rate)
    return NextResponse.json(
      { error: "Builds are temporarily unavailable" },
      { status: 503 },
    );
  if (!rate.allowed)
    return NextResponse.json({ error: "Build limit reached" }, { status: 429 });

  try {
    const build = await pgAppBuildRepository.getForOwner(id, session.user.id);
    if (!build)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!build.files.length)
      return NextResponse.json(
        { error: "This build has no saved files" },
        { status: 409 },
      );
    if (!process.env.E2B_API_KEY || process.env.E2B_API_KEY === "****") {
      return NextResponse.json(
        { error: "App builder is unavailable" },
        { status: 503 },
      );
    }
    const billing = await requireBillingContext();
    const resumed = await pgAppBuildRepository.beginResumeForOwner(
      id,
      session.user.id,
      2,
    );
    if (!resumed)
      return NextResponse.json(
        {
          error:
            "Build is active, missing, or the active build limit was reached",
        },
        { status: 409 },
      );

    after(async () => {
      try {
        await resumeAppBuild({
          build: resumed,
          userId: session.user.id,
          customerId: billing.customerId,
          entityId: billing.entityId,
        });
      } catch (error) {
        logger.error(
          "App build resume failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        await pgAppBuildRepository
          .updateActiveForOwner(id, session.user.id, {
            status: "failed",
            error: "The app could not be resumed. Try again later.",
          })
          .catch(() => null);
      }
    });
    return NextResponse.json(
      { buildId: id, status: "provisioning" },
      { status: 202 },
    );
  } catch (error) {
    logger.error(
      "App build resume admission failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Could not resume this build" },
      { status: 500 },
    );
  }
});
