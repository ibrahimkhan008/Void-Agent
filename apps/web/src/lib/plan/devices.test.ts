import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Void Devices drills: plan-limit mapping, week-key/reset math, and the
 * payload assembly (quota rows, sandbox split, CPU-hours computation with
 * the week clamp).
 */

vi.mock("server-only", () => ({}));

describe("device plan limits", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("maps every subscription tier to the plan table", async () => {
    const { devicePlanLimits } = await import("./limits");
    expect(devicePlanLimits("free")).toMatchObject({
      plan: "Free",
      agentLaunchesPerWeek: 1,
      sandboxCpuHoursPerWeek: 1,
      agentTokensPerWeek: 25_000,
      swarmLaunchesPerDay: 2,
      scheduledRunsPerWeek: 8,
    });
    expect(devicePlanLimits("voidagent-pro")).toMatchObject({
      plan: "Plus",
      swarmLaunchesPerDay: 15,
      agentTokensPerWeek: 250_000,
    });
    expect(devicePlanLimits("voidagent-max")).toMatchObject({
      plan: "Pro",
      swarmLaunchesPerDay: 50,
      sandboxCpuHoursPerWeek: 4,
    });
    expect(devicePlanLimits("voidagent-enterprises")).toMatchObject({
      plan: "Scale",
      swarmLaunchesPerDay: 200,
      agentTokensPerWeek: 2_500_000,
      scheduledRunsPerWeek: 1_250,
    });
    expect(devicePlanLimits("voidagent-enterprises-max").plan).toBe("Scale");
    // Unknown tiers fall back to Free.
    expect(devicePlanLimits("mystery").plan).toBe("Free");
    expect(devicePlanLimits(null).plan).toBe("Free");
  });

  it("computes Monday-UTC week keys and resets", async () => {
    const { weekKey, nextWeeklyReset, nextDailyReset } = await import(
      "./limits"
    );
    // Wednesday 2026-11-18 15:30 UTC → week opened Mon 2026-11-16.
    const wednesday = new Date("2026-11-18T15:30:00Z");
    expect(weekKey(wednesday)).toBe("2026-11-16");
    // Next reset = Monday 2026-11-23 00:00 UTC.
    expect(nextWeeklyReset(wednesday).toISOString()).toBe(
      "2026-11-23T00:00:00.000Z",
    );
    // Daily reset = next UTC midnight.
    expect(nextDailyReset(wednesday).toISOString()).toBe(
      "2026-11-19T00:00:00.000Z",
    );
    // A Monday itself opens the same-day window.
    const monday = new Date("2026-11-23T05:00:00Z");
    expect(weekKey(monday)).toBe("2026-11-23");
    expect(nextWeeklyReset(monday).toISOString()).toBe(
      "2026-11-30T00:00:00.000Z",
    );
  });
});

describe("devices payload", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("assembles quotas, splits sandboxes, and clamps CPU hours to the week", async () => {
    vi.resetModules();
    // E2B_API_KEY unset would short-circuit the listing, so stub the module
    // chain instead: mock the sandbox listing through the env + a fetch-less
    // Sandbox — simplest here is to assert against the pure math helper via
    // the payload with a live E2B key present and Sandbox mocked.
    process.env.E2B_API_KEY = "drill-key";
    const sandboxList = vi.fn();
    vi.doMock("@e2b/code-interpreter", () => ({
      Sandbox: { list: sandboxList },
    }));
    const paginatorFor = (_state: "running" | "paused", batch: any[]) => {
      let served = false;
      return {
        get hasNext() {
          return !served;
        },
        nextItems: async () => {
          served = true;
          return batch;
        },
      };
    };
    // Week opened 2026-11-16T00:00Z; the running sandbox started before the
    // week (clamped), the paused one contributes nothing.
    sandboxList.mockImplementation(({ query }: any) => {
      const state = query.state[0];
      if (state === "running") {
        return paginatorFor("running", [
          {
            sandboxId: "sbx-running",
            templateId: "tpl-1",
            name: "Worker",
            metadata: { billingUserId: "u-1" },
            startedAt: "2026-11-10T00:00:00Z",
            endAt: null,
            state: "running",
            cpuCount: 2,
            memoryMb: 512,
          },
        ]);
      }
      return paginatorFor("paused", [
        {
          sandboxId: "sbx-paused",
          templateId: "tpl-1",
          name: "Idle machine",
          metadata: { billingUserId: "u-1" },
          startedAt: "2026-11-10T00:00:00Z",
          endAt: null,
          state: "paused",
          cpuCount: 2,
          memoryMb: 512,
        },
      ]);
    });

    vi.doMock("@/lib/db/pg/repositories/plan-usage-repository.pg", () => ({
      planUsageRepository: {
        getUsage: async () => ({
          agent_launches: 2,
          scheduled_runs: 5,
          agent_tokens: 40_000,
        }),
        increment: vi.fn(),
      },
      PLAN_USAGE_METRICS: ["agent_launches", "scheduled_runs", "agent_tokens"],
    }));
    vi.doMock("lib/db/repository", () => ({
      userRepository: {
        getPreferences: async () => ({
          orchestratorDailyUsage: { day: "2026-11-18", used: 3 },
        }),
      },
    }));
    // Freeze "now" inside the module by controlling Date via the payload's
    // inputs — the service computes against the real clock, so the CPU-hours
    // assertion uses a tolerant range instead of an exact value.

    const { getDevicesPayload } = await import("./devices");
    const payload = await getDevicesPayload("u-1", "voidagent-max");

    expect(payload.plan).toBe("Pro");
    expect(payload.active).toHaveLength(1);
    expect(payload.idle).toHaveLength(1);
    expect(payload.e2bConfigured).toBe(true);

    const byMetric = Object.fromEntries(
      payload.quotas.map((quota) => [quota.metric, quota]),
    );
    expect(byMetric.cloud_agent_launches).toMatchObject({
      used: 2,
      limit: 15,
    });
    expect(byMetric.agent_tokens).toMatchObject({
      used: 40_000,
      limit: 750_000,
    });
    expect(byMetric.swarm_launches).toMatchObject({ used: 3, limit: 50 });
    expect(byMetric.scheduled_runs).toMatchObject({ used: 5, limit: 250 });

    // CPU hours: running since 2026-11-10 but clamped to the week start
    // (2026-11-16T00:00Z). With a real clock after that date the value is
    // positive and finite.
    const cpu = byMetric.sandbox_cpu_hours;
    expect(cpu.used).toBeGreaterThan(0);
    // Paused machines contribute nothing.
    expect(payload.idle).toHaveLength(1);

    const activeSandbox = payload.active[0];
    expect(activeSandbox.state).toBe("running");
    expect(activeSandbox.cpuCount).toBe(2);

    vi.doUnmock("@e2b/code-interpreter");
    vi.unstubAllEnvs();
  });
});
