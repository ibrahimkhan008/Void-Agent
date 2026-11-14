import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The steel client reads env at call time for URLs but captures
 * IS_STEEL_CONFIGURED and the run-slot state at module scope, so every test
 * reloads the module under its own env via `vi.resetModules()`.
 */
async function loadClient() {
  vi.resetModules();
  return import("./client");
}

const SESSION_OK = {
  ok: true,
  status: 200,
  json: async () => ({ id: "sess-1", status: "live" }),
  text: async () => "",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => SESSION_OK as Response),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("IS_STEEL_CONFIGURED", () => {
  it("requires both the browser and the executor URLs", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    let client = await loadClient();
    expect(client.IS_STEEL_CONFIGURED).toBe(false);

    vi.stubEnv("STEEL_EXECUTOR_URL", "http://steel-executor:8080");
    client = await loadClient();
    expect(client.IS_STEEL_CONFIGURED).toBe(true);
  });
});

describe("createSteelBrowserSession", () => {
  it("creates the active session with the live-view URL", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_PUBLIC_BASE_URL", "https://browser.example.com");
    const client = await loadClient();
    const session = await client.createSteelBrowserSession();
    expect(session.sessionId).toBe("sess-1");
    expect(session.liveViewUrl).toBe("https://browser.example.com/ui/");
    expect(session.browserType).toBe("headless");
    expect(fetch).toHaveBeenCalledWith(
      "http://steel:3000/v1/sessions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails fast while another run holds the single-session slot", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    const client = await loadClient();
    await client.createSteelBrowserSession();
    // The slot frees only on destroy — a second create must not clobber it.
    await expect(client.createSteelBrowserSession()).rejects.toThrow(
      /already running/,
    );
    // The first create call is the only network traffic so far.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates a Steel API failure without leaking the slot", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            status: 500,
            ok: false,
            text: async () => "boom",
          }) as unknown as Response,
      ),
    );
    const client = await loadClient();
    await expect(client.createSteelBrowserSession()).rejects.toThrow(
      /Steel request failed \(500\)/,
    );
    // The failed create never held the slot — the next run can start.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => SESSION_OK as Response),
    );
    const session = await client.createSteelBrowserSession();
    expect(session.sessionId).toBe("sess-1");
  });
});

describe("destroySteelBrowserSession", () => {
  it("releases the session and frees the run slot", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    const client = await loadClient();
    const session = await client.createSteelBrowserSession();

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await client.destroySteelBrowserSession(session);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://steel:3000/v1/sessions/sess-1/release",
      expect.objectContaining({ method: "POST" }),
    );

    // The slot is free again: a new run creates without the busy error.
    fetchMock.mockImplementation(async () => SESSION_OK as Response);
    const next = await client.createSteelBrowserSession();
    expect(next.sessionId).toBe("sess-1");
  });

  it("frees the slot even when the release call fails", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    const client = await loadClient();
    const session = await client.createSteelBrowserSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );
    await expect(
      client.destroySteelBrowserSession(session),
    ).resolves.toBeUndefined();
    // Slot freed despite the failure — otherwise every future run locks out.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => SESSION_OK as Response),
    );
    await expect(client.createSteelBrowserSession()).resolves.toBeTruthy();
  });
});

describe("steelPlaywrightExecute", () => {
  it("posts the CDP url and code, returning the executor's result", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_EXECUTOR_URL", "http://steel-executor:8080");
    const client = await loadClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ ok: true, result: "Example Domain" }),
          }) as unknown as Response,
      ),
    );
    const result = await client.steelPlaywrightExecute(
      "return page.title();",
      30,
    );
    expect(result).toBe("Example Domain");
    expect(fetch).toHaveBeenCalledWith(
      "http://steel-executor:8080/execute",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          cdpUrl: "ws://steel:3000/",
          code: "return page.title();",
          timeoutSec: 30,
        }),
      }),
    );
  });

  it("throws when the executor reports a failure", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_EXECUTOR_URL", "http://steel-executor:8080");
    const client = await loadClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ ok: false, error: "Target closed" }),
          }) as unknown as Response,
      ),
    );
    await expect(client.steelPlaywrightExecute("return 1")).rejects.toThrow(
      "Target closed",
    );
  });
});

describe("createSteelBrowserProvider", () => {
  it("returns null while unconfigured", async () => {
    vi.stubEnv("STEEL_BASE_URL", "");
    vi.stubEnv("STEEL_EXECUTOR_URL", "");
    vi.resetModules();
    const { createSteelBrowserProvider } = await import("./provider");
    expect(createSteelBrowserProvider()).toBeNull();
  });

  it("returns a provider without browser-second billing when configured", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_EXECUTOR_URL", "http://steel-executor:8080");
    vi.resetModules();
    const { createSteelBrowserProvider } = await import("./provider");
    const provider = createSteelBrowserProvider();
    expect(provider).not.toBeNull();
    expect(provider?.billBrowserSeconds).toBe(false);
    expect(typeof provider?.createSession).toBe("function");
    expect(typeof provider?.executeRaw).toBe("function");
  });
});

describe("steel session egress proxy (B20)", () => {
  it("passes the egress proxy as proxyUrl on session create", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "http://egress:8080");
    const client = await loadClient();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => SESSION_OK as Response);
    await client.createSteelBrowserSession();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).proxyUrl).toBe("http://egress:8080");
  });

  it("sends no proxyUrl when egress isolation is not configured", async () => {
    vi.stubEnv("STEEL_BASE_URL", "http://steel:3000");
    vi.stubEnv("STEEL_EGRESS_PROXY_URL", "");
    const client = await loadClient();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => SESSION_OK as Response);
    await client.createSteelBrowserSession();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).proxyUrl).toBeUndefined();
  });
});
