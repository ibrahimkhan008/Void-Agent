import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Void Sentinel unit drills: the probe transition matrix, assertion
 * evaluation, and the mode-gated repair pipeline (mocked driver + repos —
 * the end-to-end probe of a real deployment is the live drill).
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  repo: {
    createMonitor: vi.fn(),
    listMonitors: vi.fn(),
    getMonitor: vi.fn(),
    updateMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    listDueMonitors: vi.fn(),
    markProbed: vi.fn(),
    createIncident: vi.fn(),
    updateIncident: vi.fn(),
    listIncidents: vi.fn(),
    getIncident: vi.fn(),
    listActiveIncidents: vi.fn(),
    findOpenIncidentByMonitor: vi.fn(),
    countOpenIncidents: vi.fn(),
  },
  publish: vi.fn(),
  selectLiveBySlug: vi.fn(),
  selectOwnerIdBySlug: vi.fn(),
  executeAgentRun: vi.fn(),
  createNotifications: vi.fn(),
}));

const rows: Record<string, unknown[]> = {};

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table as never);
        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => (rows[name] ?? []) as never,
            }),
            limit: async () => (rows[name] ?? []) as never,
          }),
          limit: async () => (rows[name] ?? []) as never,
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [] as never,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [] as never,
      }),
    }),
    delete: () => ({
      where: () => ({ returning: async () => [] as never }),
    }),
  },
}));

vi.mock("@/lib/db/pg/repositories/sentinel-repository.pg", () => ({
  sentinelRepository: mocks.repo,
}));

vi.mock("@/lib/db/pg/repositories/published-page-repository.pg", () => ({
  publishedPageRepository: {
    publish: (...args: unknown[]) => mocks.publish(...args),
    selectLiveBySlug: (...args: unknown[]) => mocks.selectLiveBySlug(...args),
    selectOwnerIdBySlug: (...args: unknown[]) =>
      mocks.selectOwnerIdBySlug(...args),
  },
}));

vi.mock("@/lib/scheduled-tasks/runner", () => ({
  executeAgentRun: (...args: unknown[]) => mocks.executeAgentRun(...args),
}));

vi.mock("@/lib/notifications/create-notifications", () => ({
  createNotifications: (...args: unknown[]) =>
    mocks.createNotifications(...args),
}));

import {
  evaluateAssertions,
  evaluateProbeTransition,
  probeSite,
  runSentinelTick,
} from "./probe";
import { processSentinelIncidents } from "./repair";

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(rows)) delete rows[key];
  mocks.createNotifications.mockResolvedValue([]);
  mocks.repo.markProbed.mockResolvedValue(undefined);
  mocks.repo.updateIncident.mockImplementation(async (id, input) => ({
    id,
    ...input,
  }));
  mocks.repo.createIncident.mockImplementation(async (input) => ({
    id: "incident-new",
    ...input,
    status: "open",
  }));
});

describe("assertion evaluation", () => {
  it("passes an empty assertion set when the status is 2xx", () => {
    expect(evaluateAssertions([], 200, "hello")).toBeNull();
  });

  it("flags a non-expected status", () => {
    expect(
      evaluateAssertions([{ type: "status", value: "200" }], 502, "boom"),
    ).toContain("502");
  });

  it("flags contains and not_contains violations", () => {
    const assertions = [
      { type: "contains" as const, value: "Login" },
      { type: "not_contains" as const, value: "Stack overflow" },
    ];
    expect(
      evaluateAssertions(assertions, 200, "Welcome — Login here"),
    ).toBeNull();
    expect(
      evaluateAssertions(assertions, 200, "Welcome page without the word"),
    ).toContain("Login");
    expect(
      evaluateAssertions(assertions, 200, "Login — Stack overflow detected"),
    ).toContain("forbidden");
  });
});

describe("probe transition matrix", () => {
  it("does not open a duplicate incident while one is open", () => {
    expect(evaluateProbeTransition("broken", false, true)).toBe("still-broken");
    expect(evaluateProbeTransition("unknown", false, true)).toBe(
      "still-broken",
    );
  });

  it("opens a new incident only for a fresh break", () => {
    expect(evaluateProbeTransition("healthy", false, false)).toBe(
      "new-incident",
    );
    expect(evaluateProbeTransition("unknown", false, false)).toBe(
      "new-incident",
    );
  });

  it("confirms only a deployed fix that is now healthy", () => {
    expect(evaluateProbeTransition("broken", true, true)).toBe("confirm");
    expect(evaluateProbeTransition("broken", true, false)).toBe(
      "still-healthy",
    );
    expect(evaluateProbeTransition("healthy", true, true)).toBe(
      "still-healthy",
    );
  });
});

describe("probe", () => {
  it("fetches the public page and evaluates the assertions", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      text: async () => "<html><body>Inventory OK</body></html>",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeSite("my-site", [
      { type: "contains", value: "Inventory OK" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain("/p/my-site");
    vi.unstubAllGlobals();
  });

  it("reports unreachable sites as a failure signature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await probeSite("my-site", []);
    expect(result.ok).toBe(false);
    expect(result.failureSignature).toContain("unreachable");
    vi.unstubAllGlobals();
  });
});

describe("sentinel tick", () => {
  const monitor = {
    id: "m-1",
    userId: "u-1",
    slug: "my-site",
    mode: "monitor",
    enabled: true,
    assertions: [],
    lastStatus: "healthy",
    intervalSeconds: 300,
    lastCheckedAt: new Date(Date.now() - 10 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("opens an incident and notifies on a fresh break", async () => {
    mocks.repo.listDueMonitors.mockResolvedValue([monitor]);
    mocks.repo.findOpenIncidentByMonitor.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 500, text: async () => "boom" })),
    );

    const result = await runSentinelTick();

    expect(result.newIncidents).toBe(1);
    expect(mocks.repo.createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: "m-1",
        slug: "my-site",
        failureSignature: expect.stringContaining("500"),
      }),
    );
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sentinel_incident" }),
    );
    vi.unstubAllGlobals();
  });

  it("confirms a deployed fix when the probe goes healthy again", async () => {
    mocks.repo.listDueMonitors.mockResolvedValue([
      { ...monitor, lastStatus: "broken" },
    ]);
    mocks.repo.findOpenIncidentByMonitor.mockResolvedValue({
      id: "incident-1",
      status: "fix_deployed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, text: async () => "<html>ok</html>" })),
    );

    const result = await runSentinelTick();

    expect(result.confirmed).toBe(1);
    expect(mocks.repo.updateIncident).toHaveBeenCalledWith("incident-1", {
      status: "resolved",
    });
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sentinel_resolved" }),
    );
    vi.unstubAllGlobals();
  });
});

describe("mode-gated repair pipeline", () => {
  const incident = {
    id: "inc-1",
    monitorId: "m-1",
    userId: "u-1",
    slug: "my-site",
    status: "open",
    failureSignature: "status 500 ≠ expected 200",
    diagnosis: null,
    fixSummary: null,
    fixHtml: null,
    deployedVersion: null,
    previousVersion: null,
    verification: null,
    detectedAt: new Date(),
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const monitor = {
    id: "m-1",
    userId: "u-1",
    slug: "my-site",
    enabled: true,
    mode: "repair_approval",
    assertions: [{ type: "contains", value: "Inventory OK" }],
    intervalSeconds: 300,
    lastStatus: "broken",
    lastCheckedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const agentRow = {
    id: "agent-1",
    userId: "u-1",
    name: "Sentinel Repairer",
    description: null,
    icon: null,
    model: null,
    organizationId: null,
  };
  const fixedAnswer =
    "Fixed the broken template.\n```html\n<html>Inventory OK</html>\n```";

  beforeEach(() => {
    rows.sentinel_monitor = [monitor];
    rows.agent = [agentRow];
    rows.chat_message = [{ parts: [{ type: "text", text: fixedAnswer }] }];
    rows.published_page = [{ html: "<html>GOOD</html>", version: 2 }];
    mocks.repo.listActiveIncidents.mockResolvedValue([incident]);
    mocks.executeAgentRun.mockResolvedValue({
      success: true,
      threadId: "11111111-2222-3333-4444-555555555555",
    });
    mocks.selectLiveBySlug.mockResolvedValue({
      slug: "my-site",
      version: 3,
      title: "My site",
      html: "<html>BROKEN</html>",
      ownerId: "u-1",
      organizationId: null,
    });
    mocks.publish.mockResolvedValue({ version: 4 });
  });

  it("proposes a verified fix for approval in repair_approval mode", async () => {
    const result = await processSentinelIncidents();

    expect(result.proposed).toBe(1);
    expect(mocks.repo.updateIncident).toHaveBeenCalledWith(
      "inc-1",
      expect.objectContaining({
        status: "fix_proposed",
        verification: [{ type: "contains", passed: true }],
      }),
    );
    const [task] = mocks.executeAgentRun.mock.calls[0];
    expect(task.inputPrompt).toContain("status 500");
    expect(task.inputPrompt).toContain("LAST GOOD HTML");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sentinel_fix_proposed" }),
    );
  });

  it("deploys autonomously within limits and records the versions", async () => {
    rows.sentinel_monitor = [{ ...monitor, mode: "autonomous" }];

    const result = await processSentinelIncidents();

    expect(result.autoDeployed).toBe(1);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "my-site",
        html: "<html>Inventory OK</html>",
        ownerId: "u-1",
      }),
    );
    expect(mocks.repo.updateIncident).toHaveBeenCalledWith(
      "inc-1",
      expect.objectContaining({
        status: "fix_deployed",
        deployedVersion: 4,
        previousVersion: 3,
      }),
    );
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sentinel_deployed" }),
    );
  });

  it("never deploys when the fix fails verification", async () => {
    rows.sentinel_monitor = [{ ...monitor, mode: "autonomous" }];
    rows.chat_message = [
      {
        parts: [
          {
            type: "text",
            text: "```html\n<html><body>Still broken - the inventory table is missing</body></html>\n```",
          },
        ],
      },
    ];

    const result = await processSentinelIncidents();

    expect(result.failed).toBe(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sentinel_incident",
        title: "Sentinel fix failed verification",
      }),
    );
  });

  it("skips monitor-only sites entirely", async () => {
    rows.sentinel_monitor = [{ ...monitor, mode: "monitor" }];

    const result = await processSentinelIncidents();

    expect(result.skipped).toBe(1);
    expect(mocks.executeAgentRun).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
