import "server-only";

import { BASE_URL } from "@/lib/const";
import { sentinelRepository } from "@/lib/db/pg/repositories/sentinel-repository.pg";
import { createNotifications } from "@/lib/notifications/create-notifications";
import logger from "logger";

/**
 * Void Sentinel probe engine (master prompt §3.10 — the WATCH/DETECT and
 * CONFIRM stages). Every enabled monitor's public page is fetched on its
 * cadence; the failure signature is deliberately boring (status code,
 * timeout, content assertions) so the agent only wakes up for real breaks.
 *
 * Transition matrix (lastStatus × probe result):
 *   healthy/unknown + ok          → still healthy
 *   any + broken, no open incident → NEW incident + notify
 *   any + broken, incident open   → still broken (no duplicate incident)
 *   broken + ok, incident deployed → CONFIRM: incident resolved + notify
 *   broken + ok, no incident      → still healthy (no incident to confirm)
 */

export type SentinelAssertionType = "status" | "contains" | "not_contains";

export interface SentinelAssertion {
  type: SentinelAssertionType;
  value: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  responseTimeMs: number | null;
  failureSignature: string | null;
}

const PROBE_TIMEOUT_MS = 15_000;
const BODY_SAMPLE_CHARS = 4_000;

export function evaluateAssertions(
  assertions: SentinelAssertion[],
  status: number,
  body: string,
): string | null {
  for (const assertion of assertions) {
    if (assertion.type === "status") {
      const expected = Number(assertion.value);
      if (Number.isInteger(expected) && status !== expected) {
        return `status ${status} ≠ expected ${expected}`;
      }
    } else if (
      assertion.type === "contains" &&
      !body.includes(assertion.value)
    ) {
      return `body does not contain "${assertion.value.slice(0, 120)}"`;
    } else if (
      assertion.type === "not_contains" &&
      body.includes(assertion.value)
    ) {
      return `body contains forbidden "${assertion.value.slice(0, 120)}"`;
    }
  }
  return null;
}

export async function probeSite(
  slug: string,
  assertions: SentinelAssertion[],
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const url = `${BASE_URL}/p/${slug}`;
  let status: number | null = null;
  let body = "";
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "VoidAgentSentinel/1.0" },
      cache: "no-store",
    });
    status = response.status;
    body = (await response.text()).slice(0, BODY_SAMPLE_CHARS * 4);
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseTimeMs: Date.now() - startedAt,
      failureSignature: `unreachable: ${
        error instanceof Error ? error.message : "request failed"
      }`,
    };
  }
  const responseTimeMs = Date.now() - startedAt;
  const failure = evaluateAssertions(assertions, status, body);
  const statusOk = status >= 200 && status < 400;
  if (failure) {
    return { ok: false, status, responseTimeMs, failureSignature: failure };
  }
  if (!statusOk) {
    // A non-2xx status is itself the failure signature even when no
    // assertion fired — otherwise a broken site with an empty assertion
    // set would never open an incident.
    return {
      ok: false,
      status,
      responseTimeMs,
      failureSignature: `status ${status} ≠ expected 2xx`,
    };
  }
  return { ok: true, status, responseTimeMs, failureSignature: null };
}

export type ProbeTransition =
  | "still-healthy"
  | "new-incident"
  | "still-broken"
  | "confirm";

export function evaluateProbeTransition(
  lastStatus: "healthy" | "broken" | "unknown",
  probeOk: boolean,
  hasOpenIncident: boolean,
): ProbeTransition {
  if (probeOk) {
    return lastStatus === "broken" && hasOpenIncident
      ? "confirm"
      : "still-healthy";
  }
  return hasOpenIncident ? "still-broken" : "new-incident";
}

export interface SentinelTickResult {
  checked: number;
  newIncidents: number;
  confirmed: number;
  stillBroken: number;
  errors: number;
}

export async function runSentinelTick(limit = 10): Promise<SentinelTickResult> {
  const monitors = await sentinelRepository.listDueMonitors(new Date(), limit);
  const result: SentinelTickResult = {
    checked: 0,
    newIncidents: 0,
    confirmed: 0,
    stillBroken: 0,
    errors: 0,
  };

  for (const monitor of monitors) {
    result.checked += 1;
    try {
      const probe = await probeSite(monitor.slug, monitor.assertions);
      const openIncident = await sentinelRepository.findOpenIncidentByMonitor(
        monitor.id,
      );
      const transition = evaluateProbeTransition(
        monitor.lastStatus as "healthy" | "broken" | "unknown",
        probe.ok,
        Boolean(openIncident),
      );

      await sentinelRepository.markProbed(
        monitor.id,
        probe.ok ? "healthy" : "broken",
        new Date(),
      );

      if (transition === "new-incident" && probe.failureSignature) {
        await sentinelRepository.createIncident({
          monitorId: monitor.id,
          userId: monitor.userId,
          slug: monitor.slug,
          failureSignature: probe.failureSignature,
        });
        result.newIncidents += 1;
        await createNotifications({
          userIds: [monitor.userId],
          type: "sentinel_incident",
          title: "Sentinel detected a problem",
          body: `/p/${monitor.slug}: ${probe.failureSignature}`,
          url: "/deploy",
          push: { kind: "error", tag: `sentinel-${monitor.slug}` },
        }).catch(() => {});
      } else if (transition === "confirm" && openIncident) {
        await sentinelRepository.updateIncident(openIncident.id, {
          status: "resolved",
        });
        result.confirmed += 1;
        await createNotifications({
          userIds: [monitor.userId],
          type: "sentinel_resolved",
          title: "Sentinel confirmed the fix",
          body: `/p/${monitor.slug} is healthy again — incident resolved.`,
          url: "/deploy",
          push: { kind: "complete", tag: `sentinel-${monitor.slug}` },
        }).catch(() => {});
      } else if (transition === "still-broken") {
        result.stillBroken += 1;
      }
    } catch (error) {
      result.errors += 1;
      logger.error(
        `[sentinel] probe failed for ${monitor.slug}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return result;
}
