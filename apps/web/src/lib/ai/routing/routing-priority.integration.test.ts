import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Automatic routing priority-tier drill against the isolated PostgreSQL
 * cluster (§3.1 BYOK/routing closure): the three user-selected priorities —
 * Balanced (best task fit), Lower cost (cheapest unit price within the
 * 8-point quality band), Faster (configured latency tier within the band) —
 * exercised end to end through resolveAutomaticRoute against a real
 * configured organization (member + policy + catalog + task profiles + org
 * access), no live AI provider involved.
 */

import { pgClient, pgDb } from "../../db/pg/db.pg";
import {
  MemberTable,
  ModelDeploymentTable,
  ModelRouteAuditTable,
  ModelTaskProfileTable,
  ModelsTable,
  OrganizationAiPolicyTable,
  OrganizationModelAccessTable,
  OrganizationTable,
  UserTable,
} from "../../db/pg/schema.pg";
import { resolveAutomaticRoute } from "./service";

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

const organizationId = "routing-drill-org";
const fastModel = "routing-drill-fast";
const slowModel = "routing-drill-slow";

const users = {
  balanced: crypto.randomUUID(),
  cost: crypto.randomUUID(),
  latency: crypto.randomUUID(),
};

async function routeFor(userId: string) {
  return resolveAutomaticRoute({
    organizationId,
    userId,
    signals: {
      taskKey: "coding",
      requiresTools: true,
      requiresVision: false,
      minimumContextTokens: 0,
    },
    previousChatModel: null,
  });
}

integration("routing priority tiers (isolated configured org)", () => {
  let deploymentIdByModel: Map<string, string>;

  beforeAll(async () => {
    if (configuredUrl && !isAllowedIsolatedDb) {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 with POSTGRES_POOL_MAX >= 2",
      );
    }

    // Audit rows FK-restrict deployment deletes — always clean them first,
    // then deployments, then the rest. Repeated here before seeding so a
    // previous run's failed cleanup cannot poison this one.
    await pgDb
      .delete(ModelRouteAuditTable)
      .where(eq(ModelRouteAuditTable.organizationId, organizationId));
    await pgDb
      .delete(OrganizationModelAccessTable)
      .where(eq(OrganizationModelAccessTable.organizationId, organizationId));
    await pgDb
      .delete(ModelTaskProfileTable)
      .where(eq(ModelTaskProfileTable.modelId, fastModel));
    await pgDb
      .delete(ModelTaskProfileTable)
      .where(eq(ModelTaskProfileTable.modelId, slowModel));
    await pgDb
      .delete(ModelDeploymentTable)
      .where(eq(ModelDeploymentTable.provider, "drill-provider"));
    await pgDb.delete(ModelsTable).where(eq(ModelsTable.model, fastModel));
    await pgDb.delete(ModelsTable).where(eq(ModelsTable.model, slowModel));
    await pgDb
      .delete(OrganizationAiPolicyTable)
      .where(eq(OrganizationAiPolicyTable.organizationId, organizationId));
    await pgDb
      .delete(MemberTable)
      .where(eq(MemberTable.organizationId, organizationId));
    await pgDb
      .delete(OrganizationTable)
      .where(eq(OrganizationTable.id, organizationId));
    await pgDb.delete(UserTable).where(eq(UserTable.id, users.balanced));
    await pgDb.delete(UserTable).where(eq(UserTable.id, users.cost));
    await pgDb.delete(UserTable).where(eq(UserTable.id, users.latency));

    await pgDb.insert(UserTable).values([
      {
        id: users.balanced,
        name: "Balanced user",
        email: `${users.balanced}@test.invalid`,
        preferences: { autoRoutingMode: "balanced" },
      },
      {
        id: users.cost,
        name: "Cost user",
        email: `${users.cost}@test.invalid`,
        preferences: { autoRoutingMode: "cost" },
      },
      {
        id: users.latency,
        name: "Latency user",
        email: `${users.latency}@test.invalid`,
        preferences: { autoRoutingMode: "latency" },
      },
    ]);
    await pgDb
      .insert(OrganizationTable)
      .values({ id: organizationId, name: "Routing drill org" });
    await pgDb.insert(MemberTable).values(
      Object.values(users).map((userId) => ({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role: "member",
      })),
    );
    // Policy row: automatic routing on, generous price caps.
    await pgDb.insert(OrganizationAiPolicyTable).values({
      organizationId,
      automaticRoutingEnabled: true,
      maxInputPriceMicrosPerMillion: 1_000_000,
      maxOutputPriceMicrosPerMillion: 1_000_000,
    });

    // Catalog: the fast model scores highest but costs 4x; the slow model
    // scores 84 — inside the 8-point quality band — and is cheap. Both
    // support tools, standard retention, active, real prices.
    await pgDb.insert(ModelsTable).values([
      { model: fastModel, developer: "Drill", latencyTier: "fast" },
      { model: slowModel, developer: "Drill", latencyTier: "slow" },
    ]);
    const deployments = await pgDb
      .insert(ModelDeploymentTable)
      .values([
        {
          modelId: fastModel,
          provider: "drill-provider",
          providerModelId: "fast-1",
          region: "global",
          dataRetention: "standard",
          inputPriceMicrosPerMillion: 3_000,
          outputPriceMicrosPerMillion: 9_000,
          contextTokens: 128_000,
          supportsTools: true,
          supportsVision: false,
          active: true,
        },
        {
          modelId: slowModel,
          provider: "drill-provider",
          providerModelId: "slow-1",
          region: "global",
          dataRetention: "standard",
          inputPriceMicrosPerMillion: 1_000,
          outputPriceMicrosPerMillion: 2_000,
          contextTokens: 128_000,
          supportsTools: true,
          supportsVision: false,
          active: true,
        },
      ])
      .returning({
        id: ModelDeploymentTable.id,
        modelId: ModelDeploymentTable.modelId,
      });
    deploymentIdByModel = new Map(
      deployments.map((deployment) => [deployment.modelId, deployment.id]),
    );
    await pgDb.insert(ModelTaskProfileTable).values([
      {
        modelId: fastModel,
        taskKey: "coding",
        score: 90,
        tieBreakPriority: 1,
        bestTaskDescription: "Drill catalog entry",
        limitations: "None",
        evidence: "Drill seed",
      },
      {
        modelId: slowModel,
        taskKey: "coding",
        score: 84,
        tieBreakPriority: 2,
        bestTaskDescription: "Drill catalog entry",
        limitations: "None",
        evidence: "Drill seed",
      },
    ]);
    await pgDb.insert(OrganizationModelAccessTable).values([
      {
        organizationId,
        deploymentId: deploymentIdByModel.get(fastModel)!,
        enabled: true,
      },
      {
        organizationId,
        deploymentId: deploymentIdByModel.get(slowModel)!,
        enabled: true,
      },
    ]);
  });

  afterAll(async () => {
    if (isAllowedIsolatedDb) {
      // Audit rows FK-restrict deployment deletes — always clean them first,
      // then deployments, then the rest. Repeated here before seeding so a
      // previous run's failed cleanup cannot poison this one.
      await pgDb
        .delete(ModelRouteAuditTable)
        .where(eq(ModelRouteAuditTable.organizationId, organizationId));
      await pgDb
        .delete(OrganizationModelAccessTable)
        .where(eq(OrganizationModelAccessTable.organizationId, organizationId));
      await pgDb
        .delete(ModelTaskProfileTable)
        .where(eq(ModelTaskProfileTable.modelId, fastModel));
      await pgDb
        .delete(ModelTaskProfileTable)
        .where(eq(ModelTaskProfileTable.modelId, slowModel));
      await pgDb
        .delete(ModelDeploymentTable)
        .where(eq(ModelDeploymentTable.provider, "drill-provider"));
      await pgDb.delete(ModelsTable).where(eq(ModelsTable.model, fastModel));
      await pgDb.delete(ModelsTable).where(eq(ModelsTable.model, slowModel));
      await pgDb
        .delete(OrganizationAiPolicyTable)
        .where(eq(OrganizationAiPolicyTable.organizationId, organizationId));
      await pgDb
        .delete(MemberTable)
        .where(eq(MemberTable.organizationId, organizationId));
      await pgDb
        .delete(OrganizationTable)
        .where(eq(OrganizationTable.id, organizationId));
      await pgDb.delete(UserTable).where(eq(UserTable.id, users.balanced));
      await pgDb.delete(UserTable).where(eq(UserTable.id, users.cost));
      await pgDb.delete(UserTable).where(eq(UserTable.id, users.latency));
      await pgClient.end({ timeout: 5 });
    }
  });

  it("balanced picks the best task fit", async () => {
    const route = await routeFor(users.balanced);
    expect(route.candidate.chatModel.provider).toBe("drill-provider");
    expect(route.candidate.chatModel.model).toBe("fast-1");
    expect(route.reasonCode).toBe("task_fit:coding");
  });

  it("lower cost picks the cheapest candidate within the quality band", async () => {
    const route = await routeFor(users.cost);
    // 3,000 vs 12,000 micros — the cheap slow model wins inside the band.
    expect(route.candidate.chatModel.model).toBe("slow-1");
    expect(route.reasonCode).toBe("task_fit:cost:coding");
  });

  it("faster picks the configured fast tier within the quality band", async () => {
    const route = await routeFor(users.latency);
    expect(route.candidate.chatModel.model).toBe("fast-1");
    expect(route.reasonCode).toBe("task_fit:latency:coding");
  });

  it("audits every automatic route decision", async () => {
    await routeFor(users.balanced);
    const audits = await pgDb
      .select({
        deploymentId: ModelRouteAuditTable.deploymentId,
        reasonCode: ModelRouteAuditTable.reasonCode,
      })
      .from(ModelRouteAuditTable)
      .where(eq(ModelRouteAuditTable.organizationId, organizationId));
    expect(audits.length).toBeGreaterThanOrEqual(4);
    const fastDeploymentId = deploymentIdByModel.get(fastModel)!;
    const slowDeploymentId = deploymentIdByModel.get(slowModel)!;
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deploymentId: fastDeploymentId,
          reasonCode: "task_fit:coding",
        }),
        expect.objectContaining({
          deploymentId: slowDeploymentId,
          reasonCode: "task_fit:cost:coding",
        }),
        expect.objectContaining({
          deploymentId: fastDeploymentId,
          reasonCode: "task_fit:latency:coding",
        }),
      ]),
    );
  });
});
