import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));

import { fetchWebsiteSummary, websiteConfigSchema } from "./website";

const config = {
  supabaseUrl: "https://abc-project.supabase.co",
  supabaseSecretKey: "sb_secret_test-secret-value",
  rangeDays: 30,
};
const event = (overrides: Record<string, unknown> = {}) => ({
  created_at: "2026-11-07T10:00:00.000Z",
  kind: "pageview",
  name: null,
  path: "/",
  is_landing: true,
  channel: "google",
  source: "google",
  utm_campaign: null,
  visitor_hash: "hashed-visitor-id",
  props: null,
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("Website Cockpit provider", () => {
  it("allows only an HTTPS root URL on a Supabase hosted project domain", () => {
    expect(websiteConfigSchema.safeParse(config).success).toBe(true);
    for (const supabaseUrl of [
      "http://abc-project.supabase.co",
      "https://localhost.supabase.co",
      "https://abc-project.supabase.co.attacker.test",
      "https://127.0.0.1",
      "https://abc-project.supabase.co:8443",
      "https://abc-project.supabase.co/path",
      "https://user:pass@abc-project.supabase.co",
    ]) {
      expect(
        websiteConfigSchema.safeParse({ ...config, supabaseUrl }).success,
      ).toBe(false);
    }
  });

  it("reads bounded site_events pages with GET and returns aggregate-only data", async () => {
    const fetchMock = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        expect(String(input)).toContain(
          "https://abc-project.supabase.co/rest/v1/site_events?",
        );
        expect(String(input)).toContain("created_at=gte.");
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        const headers = new Headers(init?.headers);
        expect(headers.get("apikey")).toBe(config.supabaseSecretKey);
        return new Response(
          JSON.stringify([
            event(),
            event({
              kind: "event",
              name: "lead",
              is_landing: false,
              props: { form: "contact", email: "private@example.com" },
            }),
          ]),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const summary = await fetchWebsiteSummary(
      config,
      new Date("2026-11-07T12:00:00Z"),
    );
    expect(summary.visits).toBe(1);
    expect(summary.pageviews).toBe(1);
    expect(summary.leads).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("private@example.com");
    expect(JSON.stringify(summary)).not.toContain("hashed-visitor-id");
    expect(JSON.stringify(summary)).not.toContain(config.supabaseSecretKey);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps credentials and provider failures to safe errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("invalid API key leaked", { status: 401 }),
        ),
    );
    await expect(fetchWebsiteSummary(config)).rejects.toMatchObject({
      code: "unauthorized",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("x".repeat(2 * 1024 * 1024 + 1), { status: 200 }),
        ),
    );
    await expect(fetchWebsiteSummary(config)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects malformed response rows rather than exposing them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ email: "private@example.com" }]), {
          status: 200,
        }),
      ),
    );
    const summary = await fetchWebsiteSummary(config);
    expect(summary.visits).toBe(0);
    expect(JSON.stringify(summary)).not.toContain("private@example.com");
  });
});
