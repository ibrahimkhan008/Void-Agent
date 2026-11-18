import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgClient, pgDb } from "./db.pg";
import { pgAppBuildRepository } from "./repositories/app-build-repository.pg";
import {
  createCanvasElementComment,
  deleteCanvasElementComment,
  listCanvasElementComments,
} from "./repositories/canvas-comment-repository.pg";
import {
  getEcanvasArtifact,
  upsertEcanvasArtifact,
} from "./repositories/ecanvas-artifact-repository.pg";
import {
  claimOrchestratorCheckpoint,
  createOrchestratorCheckpoint,
  createOrchestratorCheckpointWithinQuota,
  getOrchestratorCheckpoint,
  saveOrchestratorCheckpoint,
} from "./repositories/orchestrator-checkpoint-repository.pg";
import {
  AgentTable,
  AppBuildTable,
  ChatThreadTable,
  HookRunTable,
  InboundEndpointTable,
  OrchestratorCheckpointTable,
  UserTable,
} from "./schema.pg";

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
const userA = crypto.randomUUID();
const userB = crypto.randomUUID();
const threadA = crypto.randomUUID();
const threadB = crypto.randomUUID();
const canvasId = crypto.randomUUID();
const buildA = crypto.randomUUID();
const buildB = crypto.randomUUID();
const checkpointId = crypto.randomUUID();
const agentId = crypto.randomUUID();
const hookId = crypto.randomUUID();

integration("half-done features against isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (configuredUrl && !isAllowedIsolatedDb) {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 and set POSTGRES_POOL_MAX to at least 2 for real concurrency coverage",
      );
    }

    await pgDb.insert(UserTable).values([
      {
        id: userA,
        name: "Integration owner A",
        email: `${userA}@test.invalid`,
      },
      {
        id: userB,
        name: "Integration owner B",
        email: `${userB}@test.invalid`,
      },
    ]);
    await pgDb.insert(ChatThreadTable).values([
      { id: threadA, userId: userA, title: "A01 integration thread" },
      { id: threadB, userId: userB, title: "Other owner's thread" },
    ]);
    await pgDb.insert(AgentTable).values({
      id: agentId,
      userId: userA,
      name: "Integration hook agent",
    });
    await pgDb.insert(InboundEndpointTable).values({
      id: hookId,
      userId: userA,
      agentId,
      token: `integration-${hookId}`,
      kind: "webhook",
      enabled: false,
    });
  });

  afterAll(async () => {
    if (isAllowedIsolatedDb) {
      await pgDb
        .delete(UserTable)
        .where(sql`${UserTable.id} IN (${userA}, ${userB})`);
      await pgClient.end({ timeout: 5 });
    }
  });

  it("enforces a free-tier daily swarm quota atomically across concurrent starts", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 3 }, (_, index) =>
        createOrchestratorCheckpointWithinQuota({
          id: crypto.randomUUID(),
          userId: userA,
          threadId: threadA,
          objective: `quota run ${index}`,
          workers: [
            {
              key: "research",
              role: "research",
              name: "Research",
              task: "Inspect",
            },
          ],
        }),
      ),
    );
    const firstFailure = attempts.find(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    );
    if (
      firstFailure &&
      attempts.every((attempt) => attempt.status === "rejected")
    ) {
      throw firstFailure.reason;
    }
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(2);
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      name: "OrchestratorDailyQuotaError",
      limit: 2,
      used: 2,
    });
    const checkpoints = await pgDb
      .select({ id: OrchestratorCheckpointTable.id })
      .from(OrchestratorCheckpointTable)
      .where(eq(OrchestratorCheckpointTable.userId, userA));
    expect(checkpoints).toHaveLength(2);
  });

  it("persists comments and artifacts across queries while enforcing owner filters", async () => {
    const comment = await createCanvasElementComment({
      userId: userA,
      canvasId,
      elementId: "element-1",
      body: "Persisted comment",
    });
    expect(
      await listCanvasElementComments({
        userId: userA,
        canvasId,
        elementId: "element-1",
      }),
    ).toEqual([
      expect.objectContaining({ id: comment.id, body: "Persisted comment" }),
    ]);
    expect(
      await listCanvasElementComments({
        userId: userB,
        canvasId,
        elementId: "element-1",
      }),
    ).toEqual([]);
    await expect(
      deleteCanvasElementComment({
        userId: userB,
        canvasId,
        commentId: comment.id,
      }),
    ).resolves.toBe(false);

    await upsertEcanvasArtifact({
      userId: userA,
      canvasId,
      html: "<h1>one</h1>",
    });
    await upsertEcanvasArtifact({
      userId: userA,
      canvasId,
      html: "<h1>two</h1>",
    });
    await expect(getEcanvasArtifact({ userId: userA, canvasId })).resolves.toBe(
      "<h1>two</h1>",
    );
    await expect(
      getEcanvasArtifact({ userId: userB, canvasId }),
    ).resolves.toBeNull();
  });

  it("serializes App Builder admission and persists bounded owner-scoped logs", async () => {
    const results = await Promise.all([
      pgAppBuildRepository.createIfCapacity({
        id: buildA,
        userId: userA,
        threadId: threadA,
        prompt: "integration build A",
        activeLimit: 1,
      }),
      pgAppBuildRepository.createIfCapacity({
        id: buildB,
        userId: userA,
        threadId: threadA,
        prompt: "integration build B",
        activeLimit: 1,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "created"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "active_limit"),
    ).toHaveLength(1);
    const winningId = results.find((result) => result.status === "created")
      ?.build.id;
    expect(winningId).toBeTruthy();
    await expect(
      pgAppBuildRepository.getForOwner(winningId!, userB),
    ).resolves.toBeNull();
    await expect(
      pgAppBuildRepository.appendLogForOwner(winningId!, userA, "stage ready"),
    ).resolves.toBe(true);
    await expect(
      pgAppBuildRepository.appendLogForOwner(winningId!, userB, "not yours"),
    ).resolves.toBe(false);

    const freshRead = await pgDb
      .select({ buildLog: AppBuildTable.buildLog })
      .from(AppBuildTable)
      .where(sql`${AppBuildTable.id} = ${winningId}`);
    expect(freshRead[0]?.buildLog).toContain("stage ready");
    expect(freshRead[0]?.buildLog).not.toContain("not yours");
  });

  it("recovers durable checkpoints with one concurrent owner/thread claim and rolls back failures", async () => {
    await createOrchestratorCheckpoint({
      id: checkpointId,
      userId: userA,
      threadId: threadA,
      objective: "integration checkpoint",
      workers: [
        {
          key: "research",
          role: "research",
          name: "Research",
          task: "Inspect",
        },
      ],
    });
    await saveOrchestratorCheckpoint({
      id: checkpointId,
      userId: userA,
      threadId: threadA,
      completedWorkers: [],
      status: "failed",
    });
    await expect(
      getOrchestratorCheckpoint({
        id: checkpointId,
        userId: userB,
        threadId: threadA,
      }),
    ).resolves.toBeNull();
    await expect(
      getOrchestratorCheckpoint({
        id: checkpointId,
        userId: userA,
        threadId: threadB,
      }),
    ).resolves.toBeNull();

    const claims = await Promise.all([
      claimOrchestratorCheckpoint({
        id: checkpointId,
        userId: userA,
        threadId: threadA,
      }),
      claimOrchestratorCheckpoint({
        id: checkpointId,
        userId: userA,
        threadId: threadA,
      }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const durable = await getOrchestratorCheckpoint({
      id: checkpointId,
      userId: userA,
      threadId: threadA,
    });
    expect(durable?.status).toBe("running");

    const rollbackId = crypto.randomUUID();
    await expect(
      pgDb.transaction(async (tx) => {
        await tx.insert(AppBuildTable).values({
          id: rollbackId,
          userId: userA,
          threadId: threadA,
          prompt: "must roll back",
          status: "queued",
        });
        throw new Error("injected transaction failure");
      }),
    ).rejects.toThrow("injected transaction failure");
    await expect(
      pgAppBuildRepository.getForOwner(rollbackId, userA),
    ).resolves.toBeNull();
  });

  it("enforces the migrated comment, artifact, and build-log limits in PostgreSQL", async () => {
    await expect(
      createCanvasElementComment({
        userId: userA,
        canvasId,
        elementId: "invalid",
        body: "   ",
      }),
    ).rejects.toThrow();

    await expect(
      upsertEcanvasArtifact({
        userId: userA,
        canvasId: crypto.randomUUID(),
        html: "x".repeat(524289),
      }),
    ).rejects.toThrow();

    const id = crypto.randomUUID();
    await pgDb.insert(AppBuildTable).values({
      id,
      userId: userA,
      threadId: threadA,
      prompt: "constraint check",
      status: "queued",
    });
    await expect(
      pgDb
        .update(AppBuildTable)
        .set({ buildLog: "x".repeat(20001) })
        .where(sql`${AppBuildTable.id} = ${id}`),
    ).rejects.toThrow();
    await expect(
      pgAppBuildRepository.getForOwner(id, userA),
    ).resolves.toMatchObject({
      buildLog: "",
    });
  });

  it("persists hook chain depth and enforces durable event idempotency limits", async () => {
    const eventId = `integration-${crypto.randomUUID()}`;
    await pgDb.insert(HookRunTable).values({
      eventId,
      inboundEndpointId: hookId,
      agentId,
      userId: userA,
      triggerPayload: { source: "integration" },
      chainDepth: 3,
    });
    const persisted = await pgDb
      .select({
        eventId: HookRunTable.eventId,
        chainDepth: HookRunTable.chainDepth,
      })
      .from(HookRunTable)
      .where(sql`${HookRunTable.eventId} = ${eventId}`);
    expect(persisted).toEqual([{ eventId, chainDepth: 3 }]);

    await expect(
      pgDb.insert(HookRunTable).values({
        eventId,
        inboundEndpointId: hookId,
        agentId,
        userId: userA,
      }),
    ).rejects.toThrow();
    await expect(
      pgDb.insert(HookRunTable).values({
        eventId: `invalid-depth-${crypto.randomUUID()}`,
        inboundEndpointId: hookId,
        agentId,
        userId: userA,
        chainDepth: 4,
      }),
    ).rejects.toThrow();
  });
});

if (configuredUrl && !isAllowedIsolatedDb) {
  describe("isolated PostgreSQL integration configuration", () => {
    it("rejects any non-dedicated loopback test database", () => {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 and set POSTGRES_POOL_MAX to at least 2 for real concurrency coverage",
      );
    });
  });
}
