import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("marketing sitemap", () => {
  it("lists every public marketing route on the marketing origin", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://voidagent.space/");
    expect(urls).toContain("https://voidagent.space/pricing");
    expect(urls).toContain("https://voidagent.space/docs/mcp");
    // The changelog hub's one true URL is /index.
    expect(urls).toContain("https://voidagent.space/index");
    expect(urls).not.toContain("https://voidagent.space/updates");
    for (const url of urls) {
      expect(url.startsWith("https://voidagent.space")).toBe(true);
    }
  });
});

describe("marketing robots", () => {
  it("allows crawling and points at the sitemap", () => {
    const rules = robots();
    expect(rules.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(rules.sitemap).toBe("https://voidagent.space/sitemap.xml");
  });
});
