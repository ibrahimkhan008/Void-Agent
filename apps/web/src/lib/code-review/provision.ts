import "server-only";

import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import {
  ConnectorApiError,
  callConnectorApi,
} from "@/lib/connectors/provider-api";
import { BASE_URL } from "@/lib/const";
import { pgDb } from "@/lib/db/pg/db.pg";
import { codeReviewRepository } from "@/lib/db/pg/repositories/code-review-repository.pg";
import { AgentTable, InboundEndpointTable } from "@/lib/db/pg/schema.pg";
import { encrypt } from "@/lib/security/encryption";
import { and, eq } from "drizzle-orm";
import logger from "logger";

/**
 * AI Code Review provisioning (ChatGPT Codex-style settings in Void Agent):
 * enabling a repository wires the whole unattended pipeline through the
 * existing Void Hooks infrastructure —
 *   1. find-or-create the owner's "Code Reviewer" agent,
 *   2. find-or-create a dedicated GitHub inbound endpoint whose hookConfig
 *      carries the encrypted signing secret + the codeReview scope,
 *   3. register a real webhook on the GitHub repository pointing at
 *      /api/inbound/{token} (repo scope covers hook admin on repos the
 *      user administers),
 *   4. persist the settings row with the webhook id for teardown.
 * Disabling deletes the GitHub webhook and disables the endpoint. The user
 * enabling automatic review IS the pre-authorization for posting review
 * comments unattended — the executor relies on that.
 */

const REVIEWER_AGENT_NAME = "Code Reviewer";
const HOOKS_API_VERSION_HEADERS = {
  Accept: "application/vnd.github+json",
} as const;

export interface CodeReviewProvisionInput {
  autoReview: boolean;
  reviewTrigger?: "pr_open" | "every_push" | "smart_detect" | null;
  exhaustiveReview?: boolean | null;
  reviewInstructions?: string | null;
}

export const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function findOrCreateReviewerAgent(userId: string): Promise<string> {
  const [existing] = await pgDb
    .select({ id: AgentTable.id })
    .from(AgentTable)
    .where(
      and(
        eq(AgentTable.userId, userId),
        eq(AgentTable.name, REVIEWER_AGENT_NAME),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await pgDb
    .insert(AgentTable)
    .values({
      userId,
      name: REVIEWER_AGENT_NAME,
      description:
        "Reviews pull requests for bugs, security issues and regressions. Runs automatically on enabled repositories' Code Review triggers.",
    })
    .returning({ id: AgentTable.id });
  return created.id;
}

async function findOrCreateReviewEndpoint(
  userId: string,
  repository: string,
  agentId: string,
  existingEndpointId: string | null,
): Promise<{
  endpointId: string;
  token: string;
  secret: string;
  created: boolean;
}> {
  // Reuse the endpoint the settings row already points at (re-enable path);
  // never grab an unrelated GitHub hook endpoint.
  if (existingEndpointId) {
    const [row] = await pgDb
      .select({
        id: InboundEndpointTable.id,
        token: InboundEndpointTable.token,
      })
      .from(InboundEndpointTable)
      .where(
        and(
          eq(InboundEndpointTable.id, existingEndpointId),
          eq(InboundEndpointTable.userId, userId),
        ),
      )
      .limit(1);
    if (row) {
      return {
        endpointId: row.id,
        token: row.token,
        secret: "",
        created: false,
      };
    }
  }

  const secret = randomBytes(24).toString("hex");
  const token = `vhk_${randomBytes(12).toString("hex")}`;
  const [created] = await pgDb
    .insert(InboundEndpointTable)
    .values({
      userId,
      agentId,
      token,
      kind: "github",
      secretHash: sha256Hex(secret),
      enabled: true,
      hookConfig: {
        githubSigningSecretEncrypted: encrypt(secret),
        cooldownSeconds: 10,
        maxRunsPerDay: 100,
        codeReview: { repository },
      },
    })
    .returning({ id: InboundEndpointTable.id });
  return { endpointId: created.id, token, secret, created: true };
}

async function createRepoWebhook(
  userId: string,
  repository: string,
  token: string,
  secret: string,
): Promise<number> {
  const [owner, repo] = repository.split("/");
  const result = await callConnectorApi(
    userId,
    "github",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
    {
      method: "POST",
      headers: HOOKS_API_VERSION_HEADERS,
      body: {
        name: "web",
        active: true,
        events: ["pull_request", "push"],
        config: {
          url: `${BASE_URL}/api/inbound/${token}`,
          content_type: "json",
          ...(secret ? { secret } : {}),
          insecure_ssl: "0",
        },
      },
    },
  );
  const webhookId = (result as { id?: unknown }).id;
  if (typeof webhookId !== "number") {
    throw new ConnectorApiError("GitHub did not return a webhook id");
  }
  return webhookId;
}

async function deleteRepoWebhook(
  userId: string,
  repository: string,
  webhookId: number,
): Promise<void> {
  const [owner, repo] = repository.split("/");
  try {
    await callConnectorApi(
      userId,
      "github",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${webhookId}`,
      { method: "DELETE" },
    );
  } catch (error) {
    // A missing webhook is the desired end state; anything else is logged
    // but must not block disabling the feature locally.
    logger.warn(
      `[code-review] webhook delete for ${repository}#${webhookId} failed`,
      error instanceof Error ? error.message : error,
    );
  }
}

export async function enableCodeReview(
  userId: string,
  repository: string,
  input: CodeReviewProvisionInput,
): Promise<{ endpointId: string | null; webhookId: number | null }> {
  const agentId = await findOrCreateReviewerAgent(userId);
  const existing = await codeReviewRepository.getRepoSetting(
    userId,
    repository,
  );
  const { endpointId, token, secret, created } =
    await findOrCreateReviewEndpoint(
      userId,
      repository,
      agentId,
      existing?.endpointId ?? null,
    );

  let webhookId: number | null = null;
  if (input.autoReview) {
    webhookId = await createRepoWebhook(userId, repository, token, secret);
  }

  await codeReviewRepository.upsertRepoSetting(userId, repository, {
    autoReview: input.autoReview,
    reviewTrigger: input.reviewTrigger ?? null,
    exhaustiveReview: input.exhaustiveReview ?? null,
    reviewInstructions: input.reviewInstructions ?? null,
    endpointId,
    webhookId,
  });

  // Re-enabling on an endpoint reused from a previous disable flips it back
  // on; a freshly created one is already enabled.
  if (!created) {
    await pgDb
      .update(InboundEndpointTable)
      .set({ enabled: true })
      .where(eq(InboundEndpointTable.id, endpointId));
  }
  return { endpointId, webhookId };
}

export async function disableCodeReview(
  userId: string,
  repository: string,
): Promise<void> {
  const setting = await codeReviewRepository.getRepoSetting(userId, repository);
  if (setting?.webhookId) {
    await deleteRepoWebhook(userId, repository, setting.webhookId);
  }
  if (setting?.endpointId) {
    await pgDb
      .update(InboundEndpointTable)
      .set({ enabled: false })
      .where(eq(InboundEndpointTable.id, setting.endpointId));
  }
  await codeReviewRepository.upsertRepoSetting(userId, repository, {
    autoReview: false,
    webhookId: null,
  });
}

export async function removeCodeReview(
  userId: string,
  repository: string,
): Promise<void> {
  await disableCodeReview(userId, repository);
  await codeReviewRepository.deleteRepoSetting(userId, repository);
}
