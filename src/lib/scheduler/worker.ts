import "server-only";

import { randomUUID } from "node:crypto";

import { BASE_URL, getBaseUrl } from "lib/const";
import { schedulerRepository } from "lib/db/pg/repositories/scheduler-repository.pg";
import { chatRepository } from "lib/db/repository";
import { notifyScheduledRun } from "lib/notifications/scheduled-run";
import { processProjectBrainQueue } from "lib/projects/brain-queue";
import {
  enqueueNightlyProjectBrainDreams,
  processProjectBrainDreamQueue,
} from "lib/projects/brain-dream";
import logger from "logger";

import { computeNextRun } from "./cron-parser";
import { acquireLeaderLock, releaseLeaderLock } from "./leader";

// ---------------------------------------------------------------------------
// P3.1 — #11 scheduled agents. The scheduler tick.
//
// One invocation:
//   1. Acquire a short-TTL leader lock against the shared cache so only
//      one worker (Vercel cron OR the standalone worker) actually runs at
//      a time. The TTL of 50s covers a 60s tick interval with slack for
//      network / clock drift. If we don't get the lock we silently no-op
//      (we're not the leader this tick).
//   2. Claim up to 10 due jobs from `scheduled_job`.
//   3. For each claim: create a run record, then synthesize a chat
//      request body and POST it to /api/chat. The chat API authenticates
//      against a user session, so a standalone worker that doesn't carry
//      cookies will see 401. The run is marked failed in that case — the
//      thread + user message are still recorded so the user can see the
//      trigger happened. (Reusing the chat pipeline end-to-end requires a
//      server-to-server auth path that is out of P3.1's scope; see the
//      risk note in context.md.)
//   4. Compute the next-run timestamp from the job's cron and persist it
//      alongside `last_run_at`.
// ---------------------------------------------------------------------------

const LEADER_KEY = "cron-tick-leader";
const LEADER_TTL_MS = 50_000;
const CLAIM_BATCH = 10;
const CLAIM_LEASE_MS = 3 * 60_000;
const CLAIM_HEARTBEAT_MS = 60_000;

const getOwnerTag = (): string => {
  return `pid-${process.pid}-${Date.now()}`;
};

const buildChatBody = (params: {
  threadId: string;
  agentId: string | null;
  triggerMessage: string;
  chatModel?: { provider: string; model: string } | null;
}) => {
  const messageId = randomUUID();
  const now = Date.now();
  return {
    id: params.threadId,
    message: {
      id: messageId,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: params.triggerMessage,
        },
      ],
      metadata: {
        createdAt: now,
      },
    },
    chatModel: params.chatModel ?? undefined,
    toolChoice: "auto" as const,
    mentions: params.agentId
      ? [
          {
            type: "agent" as const,
            agentId: params.agentId,
            name: "Scheduled Agent",
          },
        ]
      : [],
    allowedAppDefaultToolkit: [],
  };
};

const buildChatHeaders = (userId: string): Record<string, string> => {
  const secret =
    process.env.SCHEDULER_INTERNAL_SECRET || process.env.CRON_SECRET;
  return {
    "Content-Type": "application/json",
    "x-scheduler-source": "cron-tick",
    "x-scheduler-user-id": userId,
    ...(secret ? { "x-scheduler-secret": secret } : {}),
  };
};

const buildChatUrl = (): string => {
  const base = (BASE_URL || getBaseUrl() || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/api/chat`;
};

export interface SchedulerTickResult {
  claimed: number;
  ran: number;
  failed: number;
  skippedAsNotLeader: boolean;
  projectBrain: { claimed: number; completed: number; failed: number };
  projectBrainDream: { claimed: number; completed: number; failed: number };
}

export const runSchedulerTick = async (): Promise<SchedulerTickResult> => {
  const owner = getOwnerTag();
  const claimToken = randomUUID();
  const activeClaimIds = new Set<string>();
  let claimHeartbeat: ReturnType<typeof setInterval> | undefined;
  const acquired = await acquireLeaderLock(LEADER_KEY, LEADER_TTL_MS, owner);
  if (!acquired) {
    logger.debug(
      `[scheduler] tick skipped — another worker holds the leader lock`,
    );
    return {
      claimed: 0,
      ran: 0,
      failed: 0,
      skippedAsNotLeader: true,
      projectBrain: { claimed: 0, completed: 0, failed: 0 },
      projectBrainDream: { claimed: 0, completed: 0, failed: 0 },
    };
  }

  const result: SchedulerTickResult = {
    claimed: 0,
    ran: 0,
    failed: 0,
    skippedAsNotLeader: false,
    projectBrain: { claimed: 0, completed: 0, failed: 0 },
    projectBrainDream: { claimed: 0, completed: 0, failed: 0 },
  };

  try {
    try {
      result.projectBrain = await processProjectBrainQueue();
    } catch (error) {
      logger.error("[scheduler] project brain queue failed:", error);
    }
    try {
      await enqueueNightlyProjectBrainDreams();
      // Avoid spending a second model-sized budget in the same 60s tick as an ingest.
      if (result.projectBrain.claimed === 0) {
        result.projectBrainDream = await processProjectBrainDreamQueue();
      }
    } catch (error) {
      logger.error("[scheduler] project brain dream queue failed:", error);
    }
    const dueJobs = await schedulerRepository.claimDueScheduledJobs(
      new Date(),
      CLAIM_BATCH,
      claimToken,
      new Date(Date.now() + CLAIM_LEASE_MS),
    );
    result.claimed = dueJobs.length;
    if (dueJobs.length === 0) {
      return result;
    }
    for (const job of dueJobs) activeClaimIds.add(job.id);
    let renewingClaims = false;
    claimHeartbeat = setInterval(() => {
      if (renewingClaims || activeClaimIds.size === 0) return;
      renewingClaims = true;
      void schedulerRepository
        .renewScheduledJobClaims(
          [...activeClaimIds],
          claimToken,
          new Date(Date.now() + CLAIM_LEASE_MS),
        )
        .then((renewedIds) => {
          const renewed = new Set(renewedIds);
          for (const id of activeClaimIds) {
            if (!renewed.has(id)) activeClaimIds.delete(id);
          }
        })
        .catch((error) =>
          logger.error(
            "[scheduler] failed to renew scheduled-job claim lease:",
            error,
          ),
        )
        .finally(() => {
          renewingClaims = false;
        });
    }, CLAIM_HEARTBEAT_MS);
    claimHeartbeat.unref?.();

    const chatUrl = buildChatUrl();

    for (const job of dueJobs) {
      const now = new Date();
      const triggerMessage =
        typeof job.payload?.triggerMessage === "string" &&
        job.payload.triggerMessage.length > 0
          ? job.payload.triggerMessage
          : `Scheduled run for ${job.name}`;

      // The chat API normally inserts the thread; we mirror that step here
      // so that even when the /api/chat call fails (no user session) the
      // trigger is visible in the thread list.
      const threadId = randomUUID();
      try {
        await chatRepository.insertThread({
          id: threadId,
          title: `Scheduled: ${job.name}`,
          userId: job.userId,
        });
      } catch (err) {
        logger.error(
          `[scheduler] failed to insert thread for job ${job.id}:`,
          err,
        );
      }

      const run = await schedulerRepository.createScheduledRun(job.id);

      try {
        const chatModel = await chatRepository.selectLatestChatModelByUserId(
          job.userId,
        );
        const body = buildChatBody({
          threadId,
          agentId: job.agentId ?? null,
          triggerMessage,
          chatModel,
        });
        const response = await fetch(chatUrl, {
          method: "POST",
          headers: buildChatHeaders(job.userId),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          await schedulerRepository.updateScheduledRun(run.id, {
            status: "failed",
            completedAt: new Date(),
            error: `chat-api-${response.status}: ${errorText.slice(0, 500)}`,
          });
          result.failed += 1;
          await notifyScheduledRun({
            userId: job.userId,
            runId: run.id,
            jobName: job.name,
            threadId,
            failed: true,
          });
        } else {
          await schedulerRepository.updateScheduledRun(run.id, {
            status: "completed",
            completedAt: new Date(),
            output: {
              threadId,
              chatStatus: response.status,
            },
          });
          result.ran += 1;
          await notifyScheduledRun({
            userId: job.userId,
            runId: run.id,
            jobName: job.name,
            threadId,
            failed: false,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[scheduler] run for job ${job.id} threw:`, err);
        await schedulerRepository.updateScheduledRun(run.id, {
          status: "failed",
          completedAt: new Date(),
          error: message.slice(0, 1000),
        });
        result.failed += 1;
        await notifyScheduledRun({
          userId: job.userId,
          runId: run.id,
          jobName: job.name,
          threadId,
          failed: true,
        });
      }

      // Roll the job forward: one-shot jobs disable themselves after the
      // first run so the next tick won't pick them up again. Recurring
      // jobs advance `next_run_at` to the next cron fire.
      try {
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const isOnce = payload.scheduleType === "once";
        if (isOnce) {
          const completed = await schedulerRepository.completeScheduledJobClaim(
            job.id,
            job.userId,
            claimToken,
            {
              lastRunAt: now,
              nextRunAt: new Date(Date.now() + 365 * 24 * 60 * 60_000),
              status: "disabled",
            },
          );
          if (!completed) activeClaimIds.delete(job.id);
        } else {
          const nextRun = computeNextRun(job.cron, now, job.timezone ?? "UTC");
          const completed = await schedulerRepository.completeScheduledJobClaim(
            job.id,
            job.userId,
            claimToken,
            { lastRunAt: now, nextRunAt: nextRun },
          );
          if (!completed) activeClaimIds.delete(job.id);
        }
        activeClaimIds.delete(job.id);
      } catch (err) {
        logger.error(
          `[scheduler] failed to roll next_run_at for job ${job.id}:`,
          err,
        );
      }
    }
  } finally {
    if (claimHeartbeat) clearInterval(claimHeartbeat);
    try {
      await schedulerRepository.releaseScheduledJobClaims(
        [...activeClaimIds],
        claimToken,
      );
    } catch (error) {
      logger.error(
        "[scheduler] failed to release scheduled-job claims:",
        error,
      );
    }
    await releaseLeaderLock(LEADER_KEY, owner);
  }

  return result;
};
