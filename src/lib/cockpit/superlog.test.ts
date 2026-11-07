import { beforeEach, describe, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({
  tools: [] as Array<{
    name: string;
    inputSchema?: { properties?: Record<string, unknown> };
  }>,
  calls: [] as Array<{ name: string; arguments: Record<string, unknown> }>,
  options: null as unknown,
  connect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(_url: URL, options: unknown) {
      remote.options = options;
    }
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect() {
      await remote.connect();
    }
    async listTools() {
      return { tools: remote.tools };
    }
    async callTool(input: {
      name: string;
      arguments: Record<string, unknown>;
    }) {
      remote.calls.push(input);
      if (input.name === "search_incidents") {
        return {
          structuredContent:
            input.arguments.status === "open"
              ? {
                  count: 1,
                  incidents: [
                    {
                      id: "i-1",
                      title: "Checkout",
                      status: "open",
                      service: "web",
                      severity: "SEV-2",
                      firstSeen: new Date(Date.now() - 3_600_000).toISOString(),
                    },
                  ],
                }
              : {
                  incidents: [
                    {
                      id: "i-1",
                      title: "Checkout",
                      status: "open",
                      service: "web",
                      firstSeen: new Date(Date.now() - 3_600_000).toISOString(),
                    },
                  ],
                },
        };
      }
      if (input.name === "list_alerts")
        return {
          structuredContent: [
            { id: "a-1", state: "firing" },
            { id: "a-2", state: "inactive" },
          ],
        };
      if (input.name === "query_logs")
        return { structuredContent: [{ service: "api" }, { service: "api" }] };
      return { isError: true };
    }
    async close() {}
  },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("lib/security/encryption", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  isEncryptionAvailable: () => false,
}));

const {
  createBoundedSuperlogFetch,
  fetchSuperlogSummary,
  summarizeSuperlog,
  superlogConfigSchema,
} = await import("./superlog");

describe("Superlog Cockpit provider", () => {
  beforeEach(() => {
    remote.tools = [];
    remote.calls = [];
    remote.options = null;
    remote.connect.mockReset();
  });

  it("summarizes incidents, alerts, error logs and service counts within display caps", () => {
    const now = Date.now();
    const summary = summarizeSuperlog({
      now,
      open: {
        count: 3,
        incidents: [
          {
            id: "i1",
            status: "open",
            firstSeen: new Date(now - 5000).toISOString(),
            service: "web",
          },
        ],
      },
      recent: {
        incidents: [
          {
            id: "i1",
            status: "open",
            firstSeen: new Date(now - 5000).toISOString(),
            service: "web",
          },
        ],
      },
      alerts: [{ state: "firing" }, { state: "inactive" }],
      errors: { rows: [{ service_name: "web" }, { service: "api" }] },
    });
    expect(summary).toMatchObject({
      openIncidents: 3,
      incidents24h: 1,
      firingAlerts: 1,
      errors24h: 2,
    });
    expect(summary.services).toEqual([
      { name: "web", openIncidents: 1, errors24h: 1 },
      { name: "api", openIncidents: 0, errors24h: 1 },
    ]);
  });

  it("fetches the reference incident summary while sending only declared tool arguments", async () => {
    remote.tools = [
      {
        name: "search_incidents",
        inputSchema: { properties: { status: {}, since: {}, limit: {} } },
      },
      { name: "list_alerts", inputSchema: { properties: {} } },
      {
        name: "query_logs",
        inputSchema: { properties: { severity: {}, range: {}, limit: {} } },
      },
    ];
    const summary = await fetchSuperlogSummary({
      token: "superlog_pat_test-secret",
    });
    expect(summary.openIncidents).toBe(1);
    expect(summary.firingAlerts).toBe(1);
    expect(summary.errors24h).toBe(2);
    expect(
      remote.calls.find((call) => call.name === "list_alerts")?.arguments,
    ).toEqual({});
    expect(
      remote.calls.find((call) => call.name === "search_incidents")?.arguments,
    ).toMatchObject({ status: "open", limit: 100 });
    expect(remote.options).toMatchObject({
      requestInit: {
        headers: { Authorization: "Bearer superlog_pat_test-secret" },
      },
    });
  });

  it("rejects non-PAT credentials before opening a remote session", async () => {
    await expect(
      fetchSuperlogSummary({ token: "sl_public_bad-key" }),
    ).rejects.toThrow("superlog_wrong_key_type");
    expect(remote.options).toBeNull();
  });

  it("restricts egress to the fixed HTTPS MCP endpoint and rejects redirects", async () => {
    const fetcher = createBoundedSuperlogFetch(8);
    await expect(fetcher("https://attacker.test/mcp")).rejects.toThrow(
      "superlog_endpoint_rejected",
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("error");
        return new Response("123456789", {
          headers: { "content-type": "text/plain" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetcher("https://api.superlog.sh/mcp", {
      method: "POST",
    });
    await expect(response.text()).rejects.toThrow(
      "superlog_response_too_large",
    );
    vi.unstubAllGlobals();
  });

  it("requires a bounded token and no caller-controlled endpoint", () => {
    expect(
      superlogConfigSchema.safeParse({ token: "superlog_pat_valid" }).success,
    ).toBe(true);
    expect(
      superlogConfigSchema.safeParse({
        token: "superlog_pat_valid",
        mcpUrl: "https://attacker.test/mcp",
      }).success,
    ).toBe(false);
    expect(superlogConfigSchema.safeParse({ token: "short" }).success).toBe(
      false,
    );
  });
});
