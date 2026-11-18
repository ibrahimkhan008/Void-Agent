import { sentinelRepository } from "@/lib/db/pg/repositories/sentinel-repository.pg";
import { approveSentinelFix, rollbackSentinelFix } from "@/lib/sentinel/repair";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const maxDuration = 120;

/** POST /api/sentinel/incidents/[id] — action: approve | rollback | close. */
export const POST = withAuth(
  async (request, session, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const incidentId = params.id;
    const body = (await request.json().catch(() => null)) as {
      action?: string;
    } | null;
    const action = body?.action;
    if (action !== "approve" && action !== "rollback" && action !== "close") {
      return NextResponse.json(
        { error: "action must be approve, rollback or close" },
        { status: 400 },
      );
    }

    const userId = session.user.id;
    if (action === "approve") {
      const result = await approveSentinelFix(userId, incidentId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, version: result.version });
    }
    if (action === "rollback") {
      const result = await rollbackSentinelFix(userId, incidentId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, version: result.version });
    }
    const incident = await sentinelRepository.getIncident(userId, incidentId);
    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 },
      );
    }
    await sentinelRepository.updateIncident(incidentId, { status: "closed" });
    return NextResponse.json({ ok: true });
  },
);

/** GET /api/sentinel/incidents/[id] — one incident (owner-scoped). */
export const GET = withAuth(
  async (_request, session, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    const incident = await sentinelRepository.getIncident(
      session.user.id,
      params.id,
    );
    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ incident });
  },
);
