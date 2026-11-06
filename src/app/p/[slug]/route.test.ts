import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selectLiveBySlug: vi.fn() }));
vi.mock("lib/db/repository", () => ({
  publishedPageRepository: { selectLiveBySlug: mocks.selectLiveBySlug },
}));

import { GET } from "./route";

const slug = `public-page-${"a".repeat(24)}`;

describe("published page public reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves an unlisted page uncached in an opaque-origin sandbox", async () => {
    mocks.selectLiveBySlug.mockResolvedValue({
      slug,
      title: "Demo",
      html: "<!doctype html><h1>Demo</h1>",
    });
    const response = await GET(new Request(`https://app.example/p/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Demo</h1>");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-forms");
    expect(csp).not.toContain("allow-popups");
    expect(csp).not.toContain("allow-top-navigation");
  });

  it("rejects malformed and unavailable slugs without revealing their state", async () => {
    const malformed = "../other";
    const invalidResponse = await GET(
      new Request("https://app.example/p/../other"),
      { params: Promise.resolve({ slug: malformed }) },
    );
    expect(invalidResponse.status).toBe(404);
    expect(mocks.selectLiveBySlug).not.toHaveBeenCalled();

    mocks.selectLiveBySlug.mockResolvedValue(undefined);
    const missing = await GET(new Request(`https://app.example/p/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(missing.status).toBe(404);
  });
});
