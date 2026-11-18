import "server-only";

import { pgDb } from "@/lib/db/pg/db.pg";
import { pgPublishedPageRepository as publishedPageRepository } from "@/lib/db/pg/repositories/published-page-repository.pg";
import { sentinelRepository } from "@/lib/db/pg/repositories/sentinel-repository.pg";
import {
  AgentTable,
  ChatMessageTable,
  PublishedPageTable,
  SentinelMonitorTable,
} from "@/lib/db/pg/schema.pg";
import { createNotifications } from "@/lib/notifications/create-notifications";
import { executeAgentRun } from "@/lib/scheduled-tasks/runner";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import logger from "logger";

/**
 * Void Sentinel repair loop (master prompt §3.10 — stages 4–6, mode-gated).
 *
 * For every active incident on a monitor whose mode allows automation:
 *   1. INVESTIGATE — the bound agent diagnoses the failure from the live
 *      HTML and the last-good version and returns the complete repaired HTML
 *      (fenced) plus a summary.
 *   2. VERIFY — the monitor's assertions are replayed against the repaired
 *      HTML ("repaired ≠ verified": only a passing replay counts).
 *   3. GATE — suggest / repair_approval park the fix as `fix_proposed` and
 *      notify the owner (one-click approve in the dashboard); autonomous
 *      mode deploys immediately within its limits.
 *   4. DEPLOY — the fix is published as a NEW version through the existing
 *      pipeline (nothing overwritten); the next probe confirms and resolves,
 *      or auto-rollback restores the previous version.
 *
 * Verification note: for static published sites the assertion replay runs
 * against the repaired document itself — equivalent to serving it and
 * probing. Sandboxed serving verification for app-type sites is a follow-up.
 */

const MAX_AGENT_INPUT_CHARS = 40_000;
const MAX_FIX_HTML_CHARS = 400_000;
const MAX_AUTO_DEPLOY_BYTES = 200_000;

const REPAIR_AGENT_NAME = "Sentinel Repairer";

async function findOrCreateRepairerAgent(
  userId: string,
): Promise<string | null> {
  const [existing] = await pgDb
    .select({ id: AgentTable.id })
    .from(AgentTable)
    .where(
      and(
        eq(AgentTable.userId, userId),
        eq(AgentTable.name, REPAIR_AGENT_NAME),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await pgDb
    .insert(AgentTable)
    .values({
      userId,
      name: REPAIR_AGENT_NAME,
      description:
        "Diagnoses and repairs broken published sites for Void Sentinel. Runs unattended on incidents.",
    })
    .returning({ id: AgentTable.id });
  return created.id;
}

function extractFencedHtml(answer: string): string | null {
  const fence = /```(?:html)?\s*\n([\s\S]*?)```/iu.exec(answer);
  const candidate = (fence?.[1] ?? "").trim();
  if (!candidate || candidate.length < 20) return null;
  if (!/<html|<body|<!doctype/iu.test(candidate)) return null;
  return candidate.slice(0, MAX_FIX_HTML_CHARS);
}

function replayAssertions(
  assertions: Array<{
    type: "status" | "contains" | "not_contains";
    value: string;
  }>,
  html: string,
): Array<{ type: string; passed: boolean; detail?: string }> {
  return assertions
    .filter((assertion) => assertion.type !== "status")
    .map((assertion) => {
      const contains = html.includes(assertion.value);
      const passed = assertion.type === "contains" ? contains : !contains;
      return {
        type: assertion.type,
        passed,
        detail: passed
          ? undefined
          : `"${assertion.value.slice(0, 120)}" ${
              assertion.type === "contains"
                ? "missing from"
                : "still present in"
            } the repaired HTML`,
      };
    });
}

async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await createNotifications({
    userIds: [userId],
    type,
    title,
    body,
    url: "/deploy",
    push: {
      kind: type === "sentinel_fix_proposed" ? "complete" : "error",
      tag: "sentinel",
    },
  }).catch(() => {});
}

async function loadThreadAnswer(threadId: string): Promise<string> {
  const [message] = await pgDb
    .select({ parts: ChatMessageTable.parts })
    .from(ChatMessageTable)
    .where(
      and(
        eq(ChatMessageTable.threadId, threadId),
        eq(ChatMessageTable.role, "assistant"),
      ),
    )
    .orderBy(desc(ChatMessageTable.createdAt))
    .limit(1);
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export interface SentinelRepairResult {
  processed: number;
  diagnosed: number;
  proposed: number;
  autoDeployed: number;
  skipped: number;
  failed: number;
}

export async function processSentinelIncidents(
  limit = 5,
): Promise<SentinelRepairResult> {
  const incidents = await sentinelRepository.listActiveIncidents(limit);
  const result: SentinelRepairResult = {
    processed: 0,
    diagnosed: 0,
    proposed: 0,
    autoDeployed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const incident of incidents) {
    result.processed += 1;
    // Only freshly detected incidents go through the agent; later stages
    // wait on approval or the confirming probe.
    if (incident.status !== "open") {
      result.skipped += 1;
      continue;
    }
    const [monitor] = await pgDb
      .select()
      .from(SentinelMonitorTable)
      .where(eq(SentinelMonitorTable.id, incident.monitorId))
      .limit(1);
    if (!monitor) {
      result.skipped += 1;
      continue;
    }
    if (monitor.mode === "monitor") {
      // Monitor-only sites never get automated repair.
      result.skipped += 1;
      continue;
    }

    const agentId = await findOrCreateRepairerAgent(incident.userId);
    if (!agentId) {
      result.skipped += 1;
      continue;
    }
    const [agent] = await pgDb
      .select()
      .from(AgentTable)
      .where(eq(AgentTable.id, agentId))
      .limit(1);
    if (!agent) {
      result.skipped += 1;
      continue;
    }

    try {
      // Live (broken) HTML + the last-good version HTML as the diff surface.
      const live = await publishedPageRepository.selectLiveBySlug(
        incident.slug,
      );
      const liveHtml = live?.html ?? "";
      const [lastGood] = await pgDb
        .select({
          html: PublishedPageTable.html,
          version: PublishedPageTable.version,
        })
        .from(PublishedPageTable)
        .where(
          and(
            eq(PublishedPageTable.slug, incident.slug),
            isNull(PublishedPageTable.revokedAt),
            live?.version
              ? lt(PublishedPageTable.version, live.version)
              : eq(PublishedPageTable.version, 0),
          ),
        )
        .orderBy(desc(PublishedPageTable.version))
        .limit(1);

      const prompt = [
        `A published website broke and you must repair it.`,
        `Site slug: ${incident.slug}`,
        `Failure signature: ${incident.failureSignature}`,
        lastGood
          ? `The last known-good version is v${lastGood.version}.`
          : `No earlier version exists — repair in place.`,
        `--- CURRENT (BROKEN) HTML ---`,
        liveHtml.slice(0, MAX_AGENT_INPUT_CHARS),
        lastGood
          ? `--- LAST GOOD HTML (reference) ---\n${(lastGood.html ?? "").slice(0, MAX_AGENT_INPUT_CHARS)}`
          : "",
        `Diagnose the break, then return:`,
        `1. A one-paragraph diagnosis.`,
        `2. The COMPLETE repaired HTML document inside one \`\`\`html fenced block. Do not truncate it.`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const runResult = await executeAgentRun(
        {
          id: `sentinel-${incident.id}`,
          userId: incident.userId,
          agentId,
          inputPrompt: prompt,
          lastChatThreadId: null,
        },
        {
          name: agent.name,
          description: agent.description ?? null,
          icon: agent.icon,
          model: agent.model ?? null,
          organizationId: agent.organizationId ?? null,
        },
      );

      if (!runResult.success || !runResult.threadId) {
        const reason = runResult.error ?? "repair agent failed";
        await sentinelRepository.updateIncident(incident.id, {
          diagnosis: `Repair attempt failed: ${reason}`,
        });
        result.failed += 1;
        await notify(
          incident.userId,
          "sentinel_incident",
          "Sentinel repair attempt failed",
          `/p/${incident.slug}: ${reason}`,
        );
        continue;
      }

      // The agent's answer is the persisted thread's last assistant message.
      const answer = await loadThreadAnswer(runResult.threadId);
      const fixedHtml = extractFencedHtml(answer);
      if (!fixedHtml) {
        await sentinelRepository.updateIncident(incident.id, {
          status: "diagnosed",
          diagnosis: answer.slice(0, 8_000),
        });
        result.diagnosed += 1;
        await notify(
          incident.userId,
          "sentinel_incident",
          "Sentinel diagnosis ready (no auto-fix)",
          `/p/${incident.slug}: the agent diagnosed the failure but could not produce a complete repaired document. See the incident.`,
        );
        continue;
      }

      const diagnosisMatch = answer.split("```")[0]?.trim() ?? "";
      const verification = replayAssertions(monitor.assertions, fixedHtml);
      const allPassed = verification.every((check) => check.passed);
      await sentinelRepository.updateIncident(incident.id, {
        status: "fix_proposed",
        diagnosis: diagnosisMatch.slice(0, 8_000) || null,
        fixSummary:
          diagnosisMatch.split("\n").slice(0, 3).join(" ").slice(0, 500) ||
          "Automated repair",
        fixHtml: fixedHtml,
        verification,
      });

      if (!allPassed) {
        result.failed += 1;
        await notify(
          incident.userId,
          "sentinel_incident",
          "Sentinel fix failed verification",
          `/p/${incident.slug}: the repaired HTML did not pass the site's assertions — no deployment was made.`,
        );
        continue;
      }

      if (
        monitor.mode === "autonomous" &&
        fixedHtml.length <= MAX_AUTO_DEPLOY_BYTES
      ) {
        const previous = await publishedPageRepository.selectLiveBySlug(
          incident.slug,
        );
        const published = await publishedPageRepository.publish({
          slug: incident.slug,
          title: previous?.title ?? incident.slug,
          html: fixedHtml,
          ownerId: incident.userId,
          organizationId: previous?.organizationId ?? undefined,
        });
        await sentinelRepository.updateIncident(incident.id, {
          status: "fix_deployed",
          deployedVersion: published.version,
          previousVersion: previous?.version ?? null,
        });
        result.autoDeployed += 1;
        await notify(
          incident.userId,
          "sentinel_deployed",
          "Sentinel deployed a repair autonomously",
          `/p/${incident.slug} v${published.version} — the confirming probe will resolve the incident. Rollback is one click if needed.`,
        );
      } else {
        result.proposed += 1;
        await notify(
          incident.userId,
          "sentinel_fix_proposed",
          "Sentinel prepared a verified fix for approval",
          `/p/${incident.slug}: review and approve the fix in the Deploy dashboard.`,
        );
      }
    } catch (error) {
      result.failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(
        `[sentinel] repair failed for incident ${incident.id}`,
        reason,
      );
      await sentinelRepository
        .updateIncident(incident.id, {
          diagnosis: `Repair pipeline error: ${reason}`,
        })
        .catch(() => {});
      await notify(
        incident.userId,
        "sentinel_incident",
        "Sentinel repair pipeline error",
        reason,
      ).catch(() => {});
    }
  }
  return result;
}

/** Owner-approved deployment of a proposed fix (repair_approval mode). */
export async function approveSentinelFix(
  userId: string,
  incidentId: string,
): Promise<{ ok: boolean; version?: number; error?: string }> {
  const incident = await sentinelRepository.getIncident(userId, incidentId);
  if (!incident) return { ok: false, error: "Incident not found" };
  if (incident.status !== "fix_proposed" || !incident.fixHtml) {
    return { ok: false, error: "No proposed fix is pending approval" };
  }
  const previous = await publishedPageRepository.selectLiveBySlug(
    incident.slug,
  );
  const published = await publishedPageRepository.publish({
    slug: incident.slug,
    title: previous?.title ?? incident.slug,
    html: incident.fixHtml,
    ownerId: userId,
    organizationId: previous?.organizationId ?? undefined,
  });
  await sentinelRepository.updateIncident(incidentId, {
    status: "fix_deployed",
    deployedVersion: published.version,
    previousVersion: previous?.version ?? null,
  });
  await notify(
    userId,
    "sentinel_deployed",
    "Sentinel deployed your approved fix",
    `/p/${incident.slug} v${published.version} — the confirming probe will resolve the incident.`,
  );
  return { ok: true, version: published.version };
}

/** Owner-initiated rollback to the pre-incident version. */
export async function rollbackSentinelFix(
  userId: string,
  incidentId: string,
): Promise<{ ok: boolean; version?: number; error?: string }> {
  const incident = await sentinelRepository.getIncident(userId, incidentId);
  if (!incident) return { ok: false, error: "Incident not found" };
  if (incident.status !== "fix_deployed") {
    return { ok: false, error: "Only a deployed fix can be rolled back" };
  }
  if (!incident.previousVersion) {
    return {
      ok: false,
      error: "No previous version recorded for this incident",
    };
  }
  const [previousRow] = await pgDb
    .select({ html: PublishedPageTable.html, title: PublishedPageTable.title })
    .from(PublishedPageTable)
    .where(
      and(
        eq(PublishedPageTable.slug, incident.slug),
        eq(PublishedPageTable.version, incident.previousVersion),
      ),
    )
    .limit(1);
  if (!previousRow) return { ok: false, error: "Previous version not found" };
  const published = await publishedPageRepository.publish({
    slug: incident.slug,
    title: previousRow.title,
    html: previousRow.html,
    ownerId: userId,
  });
  await sentinelRepository.updateIncident(incidentId, {
    status: "rolled_back",
    deployedVersion: published.version,
  });
  await notify(
    userId,
    "sentinel_rolled_back",
    "Sentinel rolled back to the previous version",
    `/p/${incident.slug} is serving v${published.version} again.`,
  );
  return { ok: true, version: published.version };
}
