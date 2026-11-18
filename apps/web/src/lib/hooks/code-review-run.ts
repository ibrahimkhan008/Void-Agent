import "server-only";

import { callConnectorApi } from "@/lib/connectors/provider-api";
import { pgDb } from "@/lib/db/pg/db.pg";
import { codeReviewRepository } from "@/lib/db/pg/repositories/code-review-repository.pg";
import {
  type HookRunRow,
  countHookRunsToday,
  finishHookRun,
  lastHookRunAt,
  parseHookConfig,
} from "@/lib/db/pg/repositories/hook-repository.pg";
import {
  AgentTable,
  ChatMessageTable,
  InboundEndpointTable,
} from "@/lib/db/pg/schema.pg";
import { createNotifications } from "@/lib/notifications/create-notifications";
import { executeAgentRun } from "@/lib/scheduled-tasks/runner";
import { and, desc, eq } from "drizzle-orm";
import logger from "logger";
import type { InboundOutboxPayload } from "./executor";

/**
 * AI Code Review execution path (ChatGPT Codex-style automatic reviews).
 *
 * A GitHub hook endpoint whose hookConfig carries `codeReview.repository`
 * takes the dedicated path instead of generic hook rules: the user enabling
 * automatic review for that repository IS the pre-authorization to post
 * review comments unattended, so no HITL approval token is involved.
 *
 * Flow: trigger gate (settings + event shape) → the executor itself fetches
 * the PR diff and repository guidance (AGENTS.md / SECURITY.md) with the
 * user's GitHub connector token — the review agent analyzes from the prompt,
 * so no GitHub tools are needed inside the unattended run — then the agent's
 * summary is posted verbatim as a COMMENT review.
 */

const MAX_DIFF_CHARS = 40_000;
const MAX_PATCH_CHARS = 12_000;
const MAX_GUIDE_CHARS = 4_000;
const MAX_REVIEW_BODY_CHARS = 60_000;
const MAX_FILES = 20;

type NormalizedMeta = {
  repository?: string;
  event?: string;
  action?: string | null;
  subject?: string;
  pullNumber?: number;
};

/**
 * Trigger semantics (ChatGPT's "Review trigger"): `pr_open` reviews a pull
 * request when it is opened or reopened; `every_push` also reviews new
 * pushes to the PR branch (synchronize) and plain branch pushes;
 * `smart_detect` is experimental and behaves like `pr_open`.
 */
export function shouldRunCodeReview(
  meta: NormalizedMeta,
  reviewTrigger: string,
): { run: boolean; reason: string } {
  const event = meta.event;
  const action = meta.action ?? null;
  if (event === "pull_request") {
    if (action === "opened" || action === "reopened")
      return { run: true, reason: "" };
    if (action === "synchronize") {
      return reviewTrigger === "every_push"
        ? { run: true, reason: "" }
        : { run: false, reason: "trigger is on PR open only" };
    }
    return {
      run: false,
      reason: `pull_request ${action ?? "event"} is not reviewable`,
    };
  }
  if (event === "push") {
    return reviewTrigger === "every_push"
      ? { run: true, reason: "" }
      : { run: false, reason: "trigger is on PR open only" };
  }
  return {
    run: false,
    reason: `event ${event ?? "unknown"} is not reviewable`,
  };
}

interface PrFile {
  filename: string;
  additions: number;
  deletions: number;
  status?: string;
  patch?: string;
}

async function fetchPrFiles(
  userId: string,
  repository: string,
  pullNumber: number,
): Promise<PrFile[]> {
  const [owner, repo] = repository.split("/");
  const result = await callConnectorApi(
    userId,
    "github",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/files`,
    { query: { per_page: 30 } },
  );
  const files = Array.isArray(result) ? result : [];
  return files.slice(0, MAX_FILES).map((file: Record<string, unknown>) => ({
    filename: String(file.filename ?? ""),
    additions: Number(file.additions ?? 0),
    deletions: Number(file.deletions ?? 0),
    status: typeof file.status === "string" ? file.status : undefined,
    patch:
      typeof file.patch === "string" && file.patch.length > MAX_PATCH_CHARS
        ? `${file.patch.slice(0, MAX_PATCH_CHARS)}…[truncated]`
        : typeof file.patch === "string"
          ? file.patch
          : undefined,
  }));
}

async function fetchRepoGuide(
  userId: string,
  repository: string,
  ref: string | null,
  path: string,
): Promise<string | null> {
  const [owner, repo] = repository.split("/");
  try {
    const result = (await callConnectorApi(
      userId,
      "github",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURI(path)}`,
      { query: ref ? { ref } : {} },
    )) as Record<string, unknown>;
    if (Array.isArray(result)) return null;
    if (result.encoding !== "base64" || typeof result.content !== "string")
      return null;
    const decoded = Buffer.from(result.content, "base64").toString("utf8");
    return decoded.length > MAX_GUIDE_CHARS
      ? `${decoded.slice(0, MAX_GUIDE_CHARS)}…[truncated]`
      : decoded;
  } catch {
    // A missing guidance file is normal; never fail the review for it.
    return null;
  }
}

function buildReviewPrompt(input: {
  repository: string;
  pullNumber: number;
  title: string;
  author: string;
  head: string;
  base: string;
  body: string;
  files: PrFile[];
  agentsMd: string | null;
  securityMd: string | null;
  instructions: string | null;
  exhaustive: boolean;
}): string {
  const diffSection = input.files
    .map(
      (file) =>
        `--- ${file.filename} (+${file.additions}/-${file.deletions}${file.status ? `, ${file.status}` : ""})\n${file.patch ?? "(binary or no patch — read the file directly if needed)"}`,
    )
    .join("\n\n")
    .slice(0, MAX_DIFF_CHARS);

  const sections = [
    `You are performing an automated AI code review of a GitHub pull request.`,
    `Repository: ${input.repository}`,
    `PR #${input.pullNumber}: ${input.title} (author ${input.author})`,
    `Branch: ${input.head} -> ${input.base}`,
    input.body ? `Description:\n${input.body.slice(0, 4_000)}` : "",
    `Changed files with patches (truncated where marked):\n\n${diffSection}`,
    input.agentsMd
      ? `Repository AGENTS.md (project conventions — review against them):\n${input.agentsMd}`
      : "",
    input.securityMd
      ? `Repository SECURITY.md (security review guidance):\n${input.securityMd}`
      : "",
    input.instructions
      ? `Owner review instructions (follow them):\n${input.instructions}`
      : "",
    input.exhaustive
      ? `This is an EXHAUSTIVE review: keep analyzing until you stop finding new issues. Cover correctness, security, regressions, concurrency and resource handling, error paths, and edge cases in depth.`
      : `Review the change for correctness bugs, security issues, regressions, and edge cases.`,
    `Only report findings you can point to a specific file and location for; never speculate about code you have not seen. End with exactly one verdict line: "Verdict: safe to merge" or "Verdict: changes requested" plus a one-sentence reason.`,
  ];
  return sections.filter(Boolean).join("\n\n");
}

async function postReview(
  userId: string,
  repository: string,
  pullNumber: number,
  body: string,
): Promise<void> {
  const [owner, repo] = repository.split("/");
  await callConnectorApi(
    userId,
    "github",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews`,
    {
      method: "POST",
      body: {
        body: body.slice(0, MAX_REVIEW_BODY_CHARS),
        event: "COMMENT",
      },
    },
  );
}

async function notifyFailure(
  userId: string,
  agentId: string,
  reason: string,
  threadId: string | null,
): Promise<void> {
  try {
    await createNotifications({
      userIds: [userId],
      type: "hook_run_failure",
      title: "An automatic code review failed",
      body: reason,
      threadId,
      agentId,
      url: threadId ? `/chat/${threadId}` : "/customize",
      push: { kind: "error", tag: `code-review-${agentId}` },
    });
  } catch (error) {
    logger.error(
      "[code-review] failure notification failed",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The dedicated code-review execution for one hook run. Gate outcomes are
 * recorded as skipped runs exactly like the generic hook path.
 */
export async function runCodeReviewRun(input: {
  runId: string;
  run: HookRunRow;
  endpoint: typeof InboundEndpointTable.$inferSelect;
  repository: string;
}): Promise<{ status: "succeeded" | "failed" | "skipped"; reason?: string }> {
  const { runId, run, endpoint, repository } = input;
  const config = parseHookConfig(endpoint.hookConfig);

  const lastAt = await lastHookRunAt(endpoint.id, runId);
  if (lastAt) {
    const elapsed = (Date.now() - new Date(lastAt).getTime()) / 1000;
    if (elapsed < config.cooldownSeconds) {
      const reason = `cooldown active (${Math.round(elapsed)}s < ${config.cooldownSeconds}s)`;
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }
  }
  const runsToday = await countHookRunsToday(endpoint.id, runId);
  if (runsToday >= config.maxRunsPerDay) {
    const reason = `daily cap reached (${runsToday}/${config.maxRunsPerDay})`;
    await finishHookRun(runId, { status: "skipped", error: reason });
    return { status: "skipped", reason };
  }

  const [agent] = await pgDb
    .select()
    .from(AgentTable)
    .where(eq(AgentTable.id, run.agentId))
    .limit(1);
  if (!agent) {
    const reason = "agent not found";
    await finishHookRun(runId, { status: "failed", error: reason });
    await notifyFailure(run.userId, run.agentId, reason, null);
    return { status: "failed", reason };
  }
  if (agent.userId !== run.userId || endpoint.userId !== run.userId) {
    const reason = "hook agent ownership changed";
    await finishHookRun(runId, { status: "skipped", error: reason });
    return { status: "skipped", reason };
  }

  try {
    const payload = (run.triggerPayload ??
      (await loadEventPayload(run.eventId))) as InboundOutboxPayload | null;
    const meta = (payload?.normalized?.meta ?? {}) as NormalizedMeta;
    const effective = await codeReviewRepository.resolveEffective(
      run.userId,
      repository,
    );
    if (!effective.autoReview) {
      const reason = "code review disabled for this repository";
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }
    const gate = shouldRunCodeReview(meta, effective.reviewTrigger);
    if (!gate.run) {
      const reason = `trigger not matched: ${gate.reason}`;
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }
    const pullNumber = meta.pullNumber;
    if (typeof pullNumber !== "number") {
      const reason = "payload has no pull request number";
      await finishHookRun(runId, { status: "skipped", error: reason });
      return { status: "skipped", reason };
    }

    const [owner, repo] = repository.split("/");
    const prBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const pr = (await callConnectorApi(
      run.userId,
      "github",
      `${prBase}/pulls/${pullNumber}`,
    )) as Record<string, unknown>;
    const head = (pr.head as Record<string, unknown> | undefined)?.ref;
    const headSha = (pr.head as Record<string, unknown> | undefined)?.sha;
    const base = (pr.base as Record<string, unknown> | undefined)?.ref;

    const files = await fetchPrFiles(run.userId, repository, pullNumber);
    const [agentsMd, securityMd] = await Promise.all([
      fetchRepoGuide(
        run.userId,
        repository,
        typeof headSha === "string" ? headSha : null,
        "AGENTS.md",
      ),
      fetchRepoGuide(
        run.userId,
        repository,
        typeof headSha === "string" ? headSha : null,
        "SECURITY.md",
      ),
    ]);

    const prompt = buildReviewPrompt({
      repository,
      pullNumber,
      title: String(pr.title ?? "untitled"),
      author: String(
        (pr.user as Record<string, unknown> | undefined)?.login ?? "unknown",
      ),
      head: typeof head === "string" ? head : "unknown",
      base: typeof base === "string" ? base : "unknown",
      body: typeof pr.body === "string" ? pr.body : "",
      files,
      agentsMd,
      securityMd,
      instructions: effective.reviewInstructions,
      exhaustive: effective.exhaustiveReview,
    });

    const result = await executeAgentRun(
      {
        id: run.id,
        userId: run.userId,
        agentId: run.agentId,
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

    if (!result.success) {
      const reason = result.error ?? "code review agent failed";
      await finishHookRun(runId, {
        status: "failed",
        error: reason,
        threadId: result.threadId,
      });
      await notifyFailure(run.userId, run.agentId, reason, result.threadId);
      return { status: "failed", reason };
    }

    // The runner persists the agent's answer as the thread's last assistant
    // message; that text IS the review body.
    const summary = result.threadId
      ? await loadThreadAnswer(result.threadId)
      : "";
    if (!summary) {
      const reason = "code review produced no findings text";
      await finishHookRun(runId, {
        status: "failed",
        error: reason,
        threadId: result.threadId,
      });
      await notifyFailure(run.userId, run.agentId, reason, result.threadId);
      return { status: "failed", reason };
    }

    await postReview(run.userId, repository, pullNumber, summary);
    await finishHookRun(runId, {
      status: "succeeded",
      threadId: result.threadId,
    });
    return { status: "succeeded" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`[code-review] run ${runId} failed`, reason);
    await finishHookRun(runId, { status: "failed", error: reason }).catch(
      () => {},
    );
    await notifyFailure(run.userId, run.agentId, reason, null).catch(() => {});
    return { status: "failed", reason };
  }
}

/** The agent's final answer text from its persisted thread (the review body). */
async function loadThreadAnswer(threadId: string): Promise<string> {
  const [lastAssistantMessage] = await pgDb
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
  const parts = Array.isArray(lastAssistantMessage?.parts)
    ? lastAssistantMessage.parts
    : [];
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

async function loadEventPayload(
  eventId: string,
): Promise<InboundOutboxPayload | null> {
  const { WebhookEventOutboxTable } = await import("../db/pg/schema.pg");
  const [row] = await pgDb
    .select({ payload: WebhookEventOutboxTable.payload })
    .from(WebhookEventOutboxTable)
    .where(eq(WebhookEventOutboxTable.id, eventId))
    .limit(1);
  return (row?.payload as InboundOutboxPayload) ?? null;
}
