import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Void Hooks end-to-end pipeline against the isolated PostgreSQL cluster
 * (master prompt §3.5 full closure). This exercises every hop the
 * environment can reach for real — the signed inbound route handler, the
 * deterministic outbox id, the outbox tick's hook dispatch, the executor's
 * atomic claim + gates (rules/cooldown/cap/disabled/ownership), cross-hook
 * chaining with the depth limit, and the tick's queued-run recovery when an
 * enqueue failed. Only the three network hops the sandbox cannot host are
 * simulated: GitHub's HTTP delivery (the signed request is byte-identical to
 * what GitHub sends), the Inngest transport (captured in-process), and the
 * model call (executeAgentRun stubbed).
 */

vi.mock("server-only", () => ({}));

const inngestState = vi.hoisted(() => ({
  sent: [] as Array<{ name: string; data: unknown }>,
  handlers: new Map<string, unknown>(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: async (message: { name: string; data: unknown }) => {
      inngestState.sent.push(message);
      return { ids: ["captured"] };
    },
    createFunction: (
      options: { id: string },
      _trigger: unknown,
      handler: unknown,
    ) => {
      inngestState.handlers.set(options.id, handler);
      return { id: options.id };
    },
  },
}));

const executeAgentRun = vi.hoisted(() => ({
  fn: vi.fn<
    (
      ...args: unknown[]
    ) => Promise<{ success: boolean; threadId: string | null }>
  >(async (..._args: unknown[]) => ({ success: true, threadId: null })),
}));
vi.mock("@/lib/scheduled-tasks/runner", () => ({
  executeAgentRun: (...args: unknown[]) => executeAgentRun.fn(...args),
}));

const notifications = vi.hoisted(() => ({
  fn: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(
    async (..._args: unknown[]) => [],
  ),
}));
vi.mock("@/lib/notifications/create-notifications", () => ({
  createNotifications: (...args: unknown[]) => notifications.fn(...args),
}));

// The inbound route's error-shaping helper pulls the whole chat module
// graph; its error path is not what this pipeline test exercises.
vi.mock("../../app/api/chat/shared.chat", () => ({
  handleError: vi.fn(() => "failed"),
}));

import { POST as tickPost } from "../../app/api/hooks/tick/route";
import { POST as inboundPost } from "../../app/api/inbound/[token]/route";
import { runWebhookOutboxTick } from "../../lib/inngest/functions/webhook-outbox";
// Importing registers hookAgentRun into the captured createFunction map.
import "../../lib/inngest/functions/hooks";
import { pgClient, pgDb } from "../db/pg/db.pg";
import { createHookRun } from "../db/pg/repositories/hook-repository.pg";
import {
  AgentTable,
  HookRunTable,
  InboundEndpointTable,
  UserTable,
  WebhookEventOutboxTable,
} from "../db/pg/schema.pg";
import { githubOutboxId } from "../inbound/github";
import { encrypt } from "../security/encryption";
import { HOOK_AGENT_RUN_EVENT } from "./dispatch";
import { runHookAgent } from "./executor";
import {
  internalHookEventId,
  publishInternalHookEvent,
} from "./internal-events";

const configuredUrl = process.env.TEST_POSTGRES_URL;
const isAllowedIsolatedDb = (() => {
  if (!configuredUrl) return false;
  try {
    const parsed = new URL(configuredUrl);
    return (
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
      parsed.port === "55432" &&
      parsed.pathname === "/voidagent_migration_test" &&
      Number(process.env.POSTGRES_POOL_MAX ?? 1) >= 2
    );
  } catch {
    return false;
  }
})();

const integration = isAllowedIsolatedDb ? describe : describe.skip;

const userId = crypto.randomUUID();
const agentId = crypto.randomUUID();
const parentAgentId = crypto.randomUUID();
const childAgentId = crypto.randomUUID();
const githubEndpointId = crypto.randomUUID();
const rulesEndpointId = crypto.randomUUID();
const capEndpointId = crypto.randomUUID();
const chainParentEndpointId = crypto.randomUUID();
const chainChildEndpointId = crypto.randomUUID();
const disabledEndpointId = crypto.randomUUID();
const internalEndpointId = crypto.randomUUID();
const internalEventSourceId = crypto.randomUUID();

const GITHUB_SECRET = "hooks-e2e-github-signing-secret";
const DELIVERY = "b3f7c2a0-1111-4222-8333-c444d555e666";
let githubToken = "";
let tickSecret = "";

const signDelivery = (raw: string) =>
  `sha256=${createHmac("sha256", GITHUB_SECRET)
    .update(raw, "utf8")
    .digest("hex")}`;

const GITHUB_PAYLOAD = JSON.stringify({
  ref: "refs/heads/main",
  after: "d3adb33fc0ffee00000000000000000000000001",
  commits: [{ message: "Fix the inventory query" }],
  repository: { full_name: "acme/widgets" },
  sender: { login: "octodev" },
});

function githubRequest(
  overrides: {
    deliveryId?: string;
    event?: string;
    body?: string;
    signature?: string;
  } = {},
) {
  const raw = overrides.body ?? GITHUB_PAYLOAD;
  return new Request(`https://void.test/api/inbound/${githubToken}`, {
    method: "POST",
    headers: {
      "x-hub-signature-256": overrides.signature ?? signDelivery(raw),
      "x-github-delivery": overrides.deliveryId ?? DELIVERY,
      "x-github-event": overrides.event ?? "push",
    },
    body: raw,
  });
}

async function hookRunByEvent(eventId: string) {
  const [row] = await pgDb
    .select()
    .from(HookRunTable)
    .where(eq(HookRunTable.eventId, eventId))
    .limit(1);
  return row ?? null;
}

integration("Void Hooks end-to-end pipeline (isolated PostgreSQL)", () => {
  beforeAll(async () => {
    if (configuredUrl && !isAllowedIsolatedDb) {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 with POSTGRES_POOL_MAX >= 2",
      );
    }
    process.env.ENCRYPTION_MASTER_KEY = "hooks-e2e-master-key-32-chars!!!";
    tickSecret = "hooks-e2e-tick-secret";
    process.env.SCHEDULED_TASK_SECRET = tickSecret;
    executeAgentRun.fn.mockReset();
    executeAgentRun.fn.mockImplementation(async () => ({
      success: true,
      threadId: crypto.randomUUID(),
    }));

    await pgDb.insert(UserTable).values({
      id: userId,
      name: "Hooks E2E owner",
      email: `${userId}@test.invalid`,
    });
    await pgDb.insert(AgentTable).values([
      { id: agentId, userId, name: "GitHub hook agent" },
      { id: parentAgentId, userId, name: "Chain parent agent" },
      { id: childAgentId, userId, name: "Chain child agent" },
    ]);

    githubToken = crypto.randomUUID();
    // The tick's claimed/dispatched counts must be exact: clear stale
    // pending inbound outbox rows left by any earlier run against this
    // shared disposable cluster.
    await pgDb
      .delete(WebhookEventOutboxTable)
      .where(
        and(
          eq(WebhookEventOutboxTable.kind, "inbound"),
          eq(WebhookEventOutboxTable.status, "pending"),
        ),
      );
    await pgDb.insert(InboundEndpointTable).values([
      {
        id: githubEndpointId,
        userId,
        agentId,
        token: githubToken,
        kind: "github",
        enabled: true,
        hookConfig: {
          githubSigningSecretEncrypted: encrypt(GITHUB_SECRET),
          cooldownSeconds: 0,
          maxRunsPerDay: 10,
          matchRules: [{ field: "source", op: "equals", value: "github" }],
        },
      },
      {
        id: rulesEndpointId,
        userId,
        agentId,
        token: crypto.randomUUID(),
        kind: "webhook",
        enabled: true,
        hookConfig: {
          cooldownSeconds: 0,
          maxRunsPerDay: 10,
          matchRules: [{ field: "text", op: "startsWith", value: "acme/" }],
        },
      },
      {
        id: capEndpointId,
        userId,
        agentId,
        token: crypto.randomUUID(),
        kind: "webhook",
        enabled: true,
        hookConfig: { cooldownSeconds: 0, maxRunsPerDay: 1 },
      },
      {
        id: chainParentEndpointId,
        userId,
        agentId: parentAgentId,
        token: crypto.randomUUID(),
        kind: "webhook",
        enabled: true,
        hookConfig: {
          cooldownSeconds: 0,
          maxRunsPerDay: 10,
          chainOnSuccess: [chainChildEndpointId, githubEndpointId],
        },
      },
      {
        id: chainChildEndpointId,
        userId,
        agentId: childAgentId,
        token: crypto.randomUUID(),
        kind: "webhook",
        enabled: true,
        hookConfig: { cooldownSeconds: 0, maxRunsPerDay: 10 },
      },
      {
        id: disabledEndpointId,
        userId,
        agentId,
        token: crypto.randomUUID(),
        kind: "webhook",
        enabled: false,
        hookConfig: { cooldownSeconds: 0, maxRunsPerDay: 10 },
      },
      {
        id: internalEndpointId,
        userId,
        agentId,
        token: crypto.randomUUID(),
        kind: "event",
        enabled: true,
        hookConfig: {
          eventTypes: ["project.created"],
          cooldownSeconds: 0,
          maxRunsPerDay: 10,
        },
      },
    ]);
  });

  afterAll(async () => {
    if (isAllowedIsolatedDb) {
      // Rows owned by this run: the outbox rows are not user-FKed, so delete
      // them explicitly; everything else cascades from the user row.
      await pgDb
        .delete(WebhookEventOutboxTable)
        .where(
          and(
            eq(
              WebhookEventOutboxTable.id,
              githubOutboxId(githubEndpointId, DELIVERY),
            ),
            eq(WebhookEventOutboxTable.kind, "inbound"),
          ),
        );
      await pgDb.delete(WebhookEventOutboxTable).where(
        eq(
          WebhookEventOutboxTable.id,
          internalHookEventId({
            userId,
            endpointId: internalEndpointId,
            eventType: "project.created",
            sourceId: internalEventSourceId,
          }),
        ),
      );
      await pgDb.delete(UserTable).where(eq(UserTable.id, userId));
      await pgClient.end({ timeout: 5 });
    }
  });

  it("takes a signed GitHub delivery through route → outbox → dispatch → run", async () => {
    const response = await inboundPost(githubRequest(), {
      params: Promise.resolve({ token: githubToken }),
    });
    expect(response.status).toBe(202);
    const { eventId } = (await response.json()) as { eventId: string };
    // The outbox id is the deterministic per-endpoint delivery id.
    expect(eventId).toBe(githubOutboxId(githubEndpointId, DELIVERY));
    const [outboxRow] = await pgDb
      .select({
        kind: WebhookEventOutboxTable.kind,
        eventType: WebhookEventOutboxTable.eventType,
        status: WebhookEventOutboxTable.status,
      })
      .from(WebhookEventOutboxTable)
      .where(eq(WebhookEventOutboxTable.id, eventId))
      .limit(1);
    expect(outboxRow).toMatchObject({
      kind: "inbound",
      eventType: "inbound.received",
    });

    // Driver 1 — the Inngest outbox tick claims the event and dispatches the
    // hook run, enqueueing HOOK_AGENT_RUN_EVENT.
    const tick = await runWebhookOutboxTick();
    expect(tick.hooksDispatched).toBe(1);
    expect(inngestState.sent).toContainEqual({
      name: HOOK_AGENT_RUN_EVENT,
      data: { runId: expect.any(String) },
    });
    const queued = await hookRunByEvent(eventId);
    expect(queued?.status).toBe("queued");

    // The Inngest function executes the run through the real executor.
    const handler = inngestState.handlers.get("void-hooks-agent-run") as
      | ((args: {
          event: { data: { runId?: string } };
          step: {
            run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
          };
        }) => Promise<{ status: string }>)
      | undefined;
    expect(handler).toBeDefined();
    const outcome = await handler!({
      event: { data: { runId: queued!.id } },
      step: { run: (_name, fn) => fn() },
    });
    expect(outcome.status).toBe("succeeded");

    const finished = await hookRunByEvent(eventId);
    expect(finished?.status).toBe("succeeded");
    expect(finished?.threadId).not.toBeNull();
    expect(finished?.startedAt).not.toBeNull();
    expect(finished?.finishedAt).not.toBeNull();
    const [outboxAfter] = await pgDb
      .select({ status: WebhookEventOutboxTable.status })
      .from(WebhookEventOutboxTable)
      .where(eq(WebhookEventOutboxTable.id, eventId))
      .limit(1);
    expect(outboxAfter.status).toBe("delivered");
  });

  it("publishes a selected internal event once and dispatches it through the outbox", async () => {
    const eventInput = {
      userId,
      eventType: "project.created" as const,
      sourceId: internalEventSourceId,
      text: "Project created: test project",
      meta: { projectId: crypto.randomUUID(), name: "test project" },
    };
    expect(await publishInternalHookEvent(eventInput)).toBe(1);
    expect(await publishInternalHookEvent(eventInput)).toBe(1);
    const eventId = internalHookEventId({
      userId,
      endpointId: internalEndpointId,
      eventType: eventInput.eventType,
      sourceId: eventInput.sourceId,
    });
    const [outbox] = await pgDb
      .select({
        eventType: WebhookEventOutboxTable.eventType,
        payload: WebhookEventOutboxTable.payload,
      })
      .from(WebhookEventOutboxTable)
      .where(eq(WebhookEventOutboxTable.id, eventId))
      .limit(1);
    expect(outbox?.eventType).toBe("internal.project.created");
    expect(outbox?.payload).toMatchObject({
      userId,
      endpointId: internalEndpointId,
      agentId,
      normalized: { source: "project.created", text: eventInput.text },
    });
    const result = await runWebhookOutboxTick();
    expect(result.hooksDispatched).toBe(1);
    expect(await hookRunByEvent(eventId)).toMatchObject({
      status: "queued",
      agentId,
      userId,
    });
  });

  it("never double-runs a redelivered GitHub event", async () => {
    const response = await inboundPost(githubRequest(), {
      params: Promise.resolve({ token: githubToken }),
    });
    expect(response.status).toBe(202);
    const { eventId } = (await response.json()) as { eventId: string };
    // Same endpoint + delivery id ⇒ the same deterministic outbox row, so
    // the outbox UNIQUE id keeps the redelivery a no-op.
    expect(eventId).toBe(githubOutboxId(githubEndpointId, DELIVERY));

    const tick = await runWebhookOutboxTick();
    expect(tick.hooksDispatched).toBe(0);
    const rows = await pgDb
      .select({ id: HookRunTable.id, status: HookRunTable.status })
      .from(HookRunTable)
      .where(eq(HookRunTable.eventId, eventId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
  });

  it("rejects a tampered GitHub signature before storing anything", async () => {
    const response = await inboundPost(
      githubRequest({ signature: `sha256=${"0".repeat(64)}` }),
      { params: Promise.resolve({ token: githubToken }) },
    );
    expect(response.status).toBe(401);
    const tick = await runWebhookOutboxTick();
    expect(tick.hooksDispatched).toBe(0);
  });

  it("executes matching rules and skips non-matching ones with reasons", async () => {
    // The route path is fully covered by the GitHub scenario above; this
    // scenario drives the executor directly for webhook-shaped payloads.
    const ok = await createHookRun({
      eventId: `rules-ok:${crypto.randomUUID()}`,
      inboundEndpointId: rulesEndpointId,
      agentId,
      userId,
      triggerPayload: {
        normalized: {
          source: "webhook",
          text: "acme/widgets: push — refs/heads/main",
        },
      },
    });
    expect(ok.created).toBe(true);
    expect((await runHookAgent(ok.runId!)).status).toBe("succeeded");

    const blocked = await createHookRun({
      eventId: `rules-blocked:${crypto.randomUUID()}`,
      inboundEndpointId: rulesEndpointId,
      agentId,
      userId,
      triggerPayload: {
        normalized: { source: "webhook", text: "deploy started" },
      },
    });
    const blockedOutcome = await runHookAgent(blocked.runId!);
    expect(blockedOutcome.status).toBe("skipped");
    expect(blockedOutcome.reason).toContain("startsWith");
    expect(blockedOutcome.reason).toContain("acme/");
  });

  it("enforces the daily cap and the disabled-endpoint gate", async () => {
    const first = await createHookRun({
      eventId: `cap-1:${crypto.randomUUID()}`,
      inboundEndpointId: capEndpointId,
      agentId,
      userId,
      triggerPayload: { normalized: { source: "webhook", text: "go" } },
    });
    const firstOutcome = await runHookAgent(first.runId!);
    expect({
      status: firstOutcome.status,
      reason: firstOutcome.reason,
    }).toEqual({
      status: "succeeded",
      reason: undefined,
    });

    const second = await createHookRun({
      eventId: `cap-2:${crypto.randomUUID()}`,
      inboundEndpointId: capEndpointId,
      agentId,
      userId,
      triggerPayload: { normalized: { source: "webhook", text: "go" } },
    });
    const capped = await runHookAgent(second.runId!);
    expect(capped.status).toBe("skipped");
    expect(capped.reason).toContain("daily cap");

    const disabled = await createHookRun({
      eventId: `disabled:${crypto.randomUUID()}`,
      inboundEndpointId: disabledEndpointId,
      agentId,
      userId,
      triggerPayload: { normalized: { source: "webhook", text: "go" } },
    });
    const disabledOutcome = await runHookAgent(disabled.runId!);
    expect(disabledOutcome.status).toBe("skipped");
    expect(disabledOutcome.reason).toContain("endpoint disabled");
  });

  it("chains owner-owned hooks after success and stops at depth three", async () => {
    const parent = await createHookRun({
      eventId: `chain-parent:${crypto.randomUUID()}`,
      inboundEndpointId: chainParentEndpointId,
      agentId: parentAgentId,
      userId,
      chainDepth: 0,
      triggerPayload: { normalized: { source: "webhook", text: "go" } },
    });
    expect((await runHookAgent(parent.runId!)).status).toBe("succeeded");

    // Two chain targets were configured (the child endpoint and the github
    // endpoint), both owner-owned and enabled ⇒ exactly two queued children
    // at depth 1 with deterministic event ids and the hook_chain payload.
    const children = await pgDb
      .select()
      .from(HookRunTable)
      .where(
        and(eq(HookRunTable.chainDepth, 1), eq(HookRunTable.userId, userId)),
      );
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.status).toBe("queued");
      expect(child.eventId).toBe(
        `chain:${parent.runId}:${child.inboundEndpointId}`,
      );
      const normalized = (child.triggerPayload?.normalized ?? {}) as {
        source?: string;
        meta?: { parentRunId?: string };
      };
      expect(normalized.source).toBe("hook_chain");
      expect(normalized.meta?.parentRunId).toBe(parent.runId);
    }

    // A child executes through the same executor and the enqueue went out.
    // The dedicated chain-child endpoint carries no rules; the github child
    // keeps its source rule, which correctly filters hook_chain payloads.
    const child = children.find(
      (row) => row.inboundEndpointId === chainChildEndpointId,
    )!;
    const childOutcome = await runHookAgent(child.id);
    expect({
      status: childOutcome.status,
      reason: childOutcome.reason,
    }).toEqual({
      status: "succeeded",
      reason: undefined,
    });
    const childSends = inngestState.sent.filter(
      (message) =>
        message.name === HOOK_AGENT_RUN_EVENT &&
        (message.data as { runId?: string }).runId === child.id,
    );
    expect(childSends.length).toBeGreaterThanOrEqual(1);

    // Depth limit: a run already at depth 3 queues no children.
    const deep = await createHookRun({
      eventId: `chain-deep:${crypto.randomUUID()}`,
      inboundEndpointId: chainParentEndpointId,
      agentId: parentAgentId,
      userId,
      chainDepth: 3,
      triggerPayload: { normalized: { source: "webhook", text: "go" } },
    });
    expect((await runHookAgent(deep.runId!)).status).toBe("succeeded");
    const deepChildren = await pgDb
      .select({ id: HookRunTable.id })
      .from(HookRunTable)
      .where(
        and(eq(HookRunTable.userId, userId), eq(HookRunTable.chainDepth, 4)),
      );
    expect(deepChildren).toHaveLength(0);
  });

  it("recovers a queued run through the tick when no Inngest event exists", async () => {
    // Simulate the enqueue-failure window: a queued run with no Inngest
    // event behind it (the executor queues the row durably BEFORE enqueue).
    const orphan = await createHookRun({
      eventId: `orphan:${crypto.randomUUID()}`,
      inboundEndpointId: rulesEndpointId,
      agentId,
      userId,
      triggerPayload: {
        normalized: { source: "webhook", text: "acme/widgets: push" },
      },
    });
    expect(orphan.created).toBe(true);

    const response = await tickPost(
      new Request("https://void.test/api/hooks/tick", {
        method: "POST",
        headers: { "X-Scheduled-Task-Auth": tickSecret },
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<{ runId: string; status: string; reason?: string }>;
    };
    const match = payload.results.find(
      (result) => result.runId === orphan.runId,
    );
    expect(match?.status).toBe("succeeded");
    const [row] = await pgDb
      .select({ status: HookRunTable.status })
      .from(HookRunTable)
      .where(eq(HookRunTable.id, orphan.runId!))
      .limit(1);
    expect(row.status).toBe("succeeded");
  });

  it("rejects the tick without the shared secret", async () => {
    const response = await tickPost(
      new Request("https://void.test/api/hooks/tick", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });
});
