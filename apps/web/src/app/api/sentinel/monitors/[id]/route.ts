import {
  isSentinelMode,
  sentinelRepository,
} from "@/lib/db/pg/repositories/sentinel-repository.pg";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

/** PATCH /api/sentinel/monitors/[id] — mode, enabled, assertions, interval. */
export const PATCH = withAuth(
  async (request, session, context?: { params?: Promise<{ id: string }> }) => {
    const params = (await context?.params) ?? { id: "" };
    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      enabled?: boolean;
      assertions?: Array<{ type?: string; value?: string }>;
      intervalSeconds?: number;
    } | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (body.mode !== undefined && !isSentinelMode(body.mode)) {
      return NextResponse.json(
        {
          error: "mode must be monitor, suggest, repair_approval or autonomous",
        },
        { status: 400 },
      );
    }
    const monitor = await sentinelRepository.updateMonitor(
      session.user.id,
      params.id,
      {
        mode: body.mode as never,
        enabled: body.enabled,
        assertions: body.assertions as never,
        intervalSeconds: body.intervalSeconds,
      },
    );
    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ monitor });
  },
);

/** DELETE /api/sentinel/monitors/[id] — detach the Sentinel. */
export const DELETE = withAuth(
  async (_request, session, context?: { params?: Promise<{ id: string }> }) => {
    const params = (await context?.params) ?? { id: "" };
    const deleted = await sentinelRepository.deleteMonitor(
      session.user.id,
      params.id,
    );
    if (!deleted) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  },
);
