import { createHash, randomBytes } from "node:crypto";
import {
  listHookRuns,
  publicHookConfig,
  updateEndpointHookConfig,
} from "@/lib/db/pg/repositories/hook-repository.pg";
import { withAuth } from "auth/route-guard";
import { agentRepository, inboundRepository } from "lib/db/repository";
import { encrypt, isEncryptionAvailable } from "lib/security/encryption";
import { z } from "zod";

/**
 * Void Hooks management API (master prompt §3.5).
 *
 * GET  /api/hooks — the user's inbound endpoints (each IS a hook: it binds an
 *                  agent to an inbound URL) + recent run history.
 * POST /api/hooks — create a hook: generates the inbound token + signing
 *                  secret (the secret is returned ONCE; only its hash is
 *                  stored) and the hook config.
 *
 * The agent execution path lives in lib/hooks/executor (dispatched by the
 * outbox tick / the secret-gated /api/hooks/tick route).
 */

const sha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const CreateHookSchema = z.object({
  kind: z.enum(["webhook", "email", "slack", "github"]),
  agentId: z.string().uuid(),
  /** Optional inbound secret; generated when omitted. */
  secret: z.string().min(16).max(200).optional(),
  promptTemplate: z.string().max(8_000).optional(),
  cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
  maxRunsPerDay: z.number().int().min(1).max(1_000).optional(),
  matchRules: z
    .array(
      z.object({
        field: z.enum(["source", "from", "subject", "text"]),
        op: z.enum([
          "contains",
          "equals",
          "startsWith",
          "endsWith",
          "notContains",
          "notEquals",
        ]),
        value: z.string().min(1).max(400),
      }),
    )
    .max(6)
    .optional(),
  enabled: z.boolean().optional(),
});

export const GET = withAuth(async (_request, session) => {
  const endpoints = await inboundRepository.listInboundEndpoints(
    session.user.id,
  );
  const runs = await listHookRuns(session.user.id, 50);
  return Response.json({
    hooks: endpoints.map((endpoint) => ({
      id: endpoint.id,
      kind: endpoint.kind,
      agentId: endpoint.agentId,
      token: endpoint.token,
      enabled: endpoint.enabled,
      hookConfig: publicHookConfig(
        (endpoint as { hookConfig?: unknown }).hookConfig,
      ),
      createdAt: endpoint.createdAt,
    })),
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      agentId: run.agentId,
      threadId: run.threadId,
      error: run.error,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    })),
  });
});

export const POST = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = CreateHookSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.message },
      { status: 400 },
    );
  }
  const data = parsed.data;
  if (data.kind === "github" && !isEncryptionAvailable()) {
    return Response.json(
      { error: "GitHub hooks require ENCRYPTION_MASTER_KEY" },
      { status: 503 },
    );
  }

  // Hooks execute later without a session or active organization. Bind them
  // only to agents owned by this user; shared-agent access can be revoked.
  if (
    !(await agentRepository.checkAccess(data.agentId, session.user.id, true))
  ) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  // The secret is returned ONCE; only its hash is stored.
  const secret = data.secret ?? randomBytes(24).toString("hex");
  const token = `vhk_${randomBytes(12).toString("hex")}`;
  const endpoint = await inboundRepository.createInboundEndpoint(
    {
      agentId: data.agentId,
      token,
      kind: data.kind,
      secretHash: sha256Hex(secret),
      // Keep the endpoint inert until its filtering/cooldown config exists.
      enabled: false,
      threadTemplate: {},
    },
    session.user.id,
  );

  await updateEndpointHookConfig(endpoint.id, session.user.id, {
    promptTemplate: data.promptTemplate,
    cooldownSeconds: data.cooldownSeconds,
    maxRunsPerDay: data.maxRunsPerDay,
    matchRules: data.matchRules,
    ...(data.kind === "github"
      ? { githubSigningSecretEncrypted: encrypt(secret) }
      : {}),
  });
  if (data.enabled ?? true) {
    await inboundRepository.updateInboundEndpoint(
      endpoint.id,
      session.user.id,
      {
        enabled: true,
      },
    );
  }

  return Response.json(
    {
      hook: {
        id: endpoint.id,
        kind: endpoint.kind,
        agentId: endpoint.agentId,
        token: endpoint.token,
        enabled: data.enabled ?? true,
        hookConfig: {
          promptTemplate: data.promptTemplate,
          cooldownSeconds: data.cooldownSeconds,
          maxRunsPerDay: data.maxRunsPerDay,
          matchRules: data.matchRules,
          ...(data.kind === "github"
            ? { githubSigningSecretConfigured: true }
            : {}),
        },
      },
      // The inbound URL the event source POSTs to, and the signing secret —
      // both shown once at creation.
      inboundUrl: `/api/inbound/${endpoint.token}`,
      secret,
    },
    { status: 201 },
  );
});
