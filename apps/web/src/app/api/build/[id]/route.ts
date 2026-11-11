import { Sandbox } from "@e2b/code-interpreter";
import { withAuth } from "auth/route-guard";
import { pgAppBuildRepository } from "lib/db/pg/repositories/app-build-repository.pg";
import { pgSandboxSessionRepository } from "lib/db/pg/repositories/sandbox-session-repository.pg";
import { isSandboxOwner } from "lib/e2b/sandbox-ownership";
import logger from "lib/logger";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };
const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );

export const GET = withAuth(async (_request, session, { params }: Context) => {
  const { id } = await params;
  if (!validId(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const build = await pgAppBuildRepository
    .getForOwner(id, session.user.id)
    .catch(() => null);
  if (!build) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { build },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export const DELETE = withAuth(
  async (request, session, { params }: Context) => {
    if (!hasSameOrigin(request))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    if (!validId(id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const build = await pgAppBuildRepository
      .getForOwner(id, session.user.id)
      .catch(() => null);
    if (!build)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const active = ["queued", "generating", "provisioning"].includes(
      build.status,
    );

    try {
      if (active) {
        const cancelled = await pgAppBuildRepository.cancelForOwner(
          id,
          session.user.id,
        );
        if (!cancelled)
          return NextResponse.json(
            { error: "Build already settled" },
            { status: 409 },
          );
      }
      if (build.sandboxId) {
        if (!(await isSandboxOwner(build.sandboxId, session.user.id))) {
          return NextResponse.json(
            { error: "Sandbox ownership could not be verified" },
            { status: 409 },
          );
        }
        await Sandbox.kill(build.sandboxId, {
          apiKey: process.env.E2B_API_KEY,
        });
        await pgSandboxSessionRepository
          .markState(build.sandboxId, "killed")
          .catch(() => undefined);
      }
      if (active)
        return NextResponse.json({ status: "cancelled" }, { status: 202 });
      await pgAppBuildRepository.deleteForOwner(id, session.user.id);
      return new Response(null, { status: 204 });
    } catch (error) {
      logger.error(
        "App build cancellation or deletion failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return NextResponse.json(
        { error: "Could not stop or delete this build" },
        { status: 502 },
      );
    }
  },
);
