import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  selectCount: 0,
  saved: null as null | Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/cache", () => ({
  serverCache: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            dbMocks.selectCount += 1;
            if (dbMocks.selectCount === 1) return [];
            return dbMocks.saved
              ? [
                  {
                    id: "connection-1",
                    ...dbMocks.saved,
                    lastTestedAt: null,
                    lastTestOk: null,
                    updatedAt: new Date("2026-11-07T00:00:00Z"),
                  },
                ]
              : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        dbMocks.saved = value;
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  },
}));

import { decrypt } from "lib/security/encryption";
import {
  deploymentSummary,
  getVercelSnapshot,
  vercelConfigSchema,
} from "./vercel";
import { saveVercelConnection } from "./vercel";

afterEach(() => vi.unstubAllGlobals());

const scope = { userId: "user-1", teamId: null };
const config = {
  token: "vercel-secret-token",
  teamId: "team_abc123",
  projects: [{ key: "navigator", projectId: "prj_1", label: "Navigator" }],
};

describe("Vercel Cockpit provider", () => {
  it("matches production deployment semantics: newest state and ERROR count over seven days", () => {
    const now = 1_800_000_000_000;
    expect(
      deploymentSummary(
        [
          {
            uid: "dpl_latest",
            created: now - 1000,
            state: "READY",
            url: "nav.vercel.app",
          },
          {
            uid: "dpl_error",
            created: now - 2 * 86_400_000,
            readyState: "ERROR",
          },
          {
            uid: "dpl_old_error",
            created: now - 8 * 86_400_000,
            state: "ERROR",
          },
        ],
        now,
      ),
    ).toEqual({
      id: "dpl_latest",
      state: "READY",
      createdAt: new Date(now - 1000).toISOString(),
      url: "https://nav.vercel.app",
      failedLast7d: 1,
    });
  });

  it("requests only the production deployment list using GET and never returns its token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          deployments: [
            {
              uid: "dpl_2",
              created: 1_800_000_000_000,
              state: "READY",
              url: "nav.vercel.app",
            },
            { uid: "dpl_1", created: 1_799_827_200_000, state: "ERROR" },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = await getVercelSnapshot(config, scope, {
      nowMs: 1_800_000_000_000,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://api.vercel.com/v6/deployments?");
    expect(String(url)).toContain("projectId=prj_1");
    expect(String(url)).toContain("target=production");
    expect(String(url)).toContain("limit=20");
    expect(String(url)).toContain("teamId=team_abc123");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe("Bearer vercel-secret-token");
    expect(snapshot.projects[0]).toMatchObject({
      key: "navigator",
      label: "Navigator",
      deploy: { state: "READY", failedLast7d: 1 },
    });
    expect(JSON.stringify(snapshot)).not.toContain(config.token);
    expect(
      fetchMock.mock.calls.every(([, request]) => request.method === "GET"),
    ).toBe(true);
  });

  it("discovers a Vercel team when scope is blank and probes a bounded team list", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/v2/teams"))
        return new Response(
          JSON.stringify({
            teams: Array.from({ length: 25 }, (_, i) => ({ id: `team_${i}` })),
          }),
          { status: 200 },
        );
      if (url.includes("/v9/projects/"))
        return new Response("{}", {
          status: url.includes("teamId=team_19") ? 200 : 404,
        });
      if (url.includes("/v6/deployments"))
        return new Response(
          JSON.stringify({
            deployments: [
              { uid: "dpl_1", created: 1_800_000_000_000, state: "READY" },
            ],
          }),
          { status: 200 },
        );
      throw new Error("unexpected host/path");
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getVercelSnapshot({ ...config, teamId: "" }, scope, {
      nowMs: 1_800_000_000_000,
    });
    expect(result.projects[0].deploy?.state).toBe("READY");
    expect(calls[0]).toBe("https://api.vercel.com/v2/teams?limit=20");
    expect(calls.filter((url) => url.includes("/v9/projects/")).length).toBe(
      21,
    );
    expect(calls.at(-1)).toContain("teamId=team_19");
    expect(calls.at(-1)).toContain("limit=20");
    expect(calls.length).toBeLessThanOrEqual(23);
  });

  it("rejects invalid project config and caps project count at six", () => {
    expect(
      vercelConfigSchema.safeParse({ ...config, projects: [] }).success,
    ).toBe(false);
    expect(
      vercelConfigSchema.safeParse({
        ...config,
        projects: Array.from({ length: 7 }, (_, i) => ({
          key: `p${i}`,
          projectId: `prj_${i}`,
          label: `P${i}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      vercelConfigSchema.safeParse({
        ...config,
        projects: [config.projects[0], config.projects[0]],
      }).success,
    ).toBe(false);
  });

  it("stores the complete Vercel config as authenticated AES-GCM ciphertext and only returns a redacted projection", async () => {
    const previousKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = "0123456789abcdef0123456789abcdef";
    dbMocks.selectCount = 0;
    dbMocks.saved = null;
    try {
      const result = await saveVercelConnection(scope, config);
      const stored = dbMocks.saved as unknown as {
        secretEncrypted?: string | null;
        configEncrypted?: string;
      };
      expect(stored.secretEncrypted).toBeNull();
      expect(stored.configEncrypted).toBeTruthy();
      expect(stored.configEncrypted).not.toContain(config.token);
      expect(JSON.parse(decrypt(stored.configEncrypted!))).toEqual(config);
      expect(JSON.stringify(result)).not.toContain(config.token);
      expect(result).toMatchObject({
        connected: true,
        config: { projects: config.projects, tokenSet: true },
      });
    } finally {
      if (previousKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
      else process.env.ENCRYPTION_MASTER_KEY = previousKey;
    }
  });

  it("caps provider response bytes and converts malformed provider JSON to a generic result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("x".repeat(2 * 1024 * 1024 + 10), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response("private-malformed-token-body", { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const oversized = await getVercelSnapshot(config, scope, {
      nowMs: 1_800_000_000_000,
    });
    expect(oversized.projects[0]).toMatchObject({
      deploy: null,
      error: "unavailable",
    });
    const malformed = await getVercelSnapshot(config, scope, {
      nowMs: 1_800_000_000_000,
    });
    expect(malformed.projects[0]).toMatchObject({
      deploy: null,
      error: "unavailable",
    });
    expect(JSON.stringify([oversized, malformed])).not.toContain(
      "private-malformed-token-body",
    );
    expect(
      fetchMock.mock.calls.every(([, request]) => request.method === "GET"),
    ).toBe(true);
  });
});
