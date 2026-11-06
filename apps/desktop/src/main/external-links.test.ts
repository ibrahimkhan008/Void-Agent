import { describe, expect, it } from "vitest";
import {
  classifyDesktopNavigation,
  isAppDownloadUrl,
} from "./external-links.js";

describe("desktop navigation policy", () => {
  const origin = "https://assistant.example";

  it("allows trusted app routes and classifies known exports", () => {
    expect(classifyDesktopNavigation(`${origin}/chat`, origin)).toBe("app");
    expect(
      classifyDesktopNavigation(
        `${origin}/api/canvas/ppt/export?type=pptx`,
        origin,
      ),
    ).toBe("download");
    expect(
      classifyDesktopNavigation(
        `${origin}/api/ecanvas/export/id-1/zip`,
        origin,
      ),
    ).toBe("download");
    expect(
      classifyDesktopNavigation(
        `${origin}/api/tabular-reviews/id-1/export`,
        origin,
      ),
    ).toBe("download");
  });

  it("does not mistake lookalike hosts or paths for trusted downloads", () => {
    expect(
      isAppDownloadUrl(
        "https://assistant.example.attacker.test/api/canvas/ppt/export",
        origin,
      ),
    ).toBe(false);
    expect(
      isAppDownloadUrl(`${origin}/api/canvas/ppt/export/other`, origin),
    ).toBe(false);
    expect(
      classifyDesktopNavigation(
        "https://assistant.example.attacker.test/chat",
        origin,
      ),
    ).toBe("external");
  });

  it("allows only HTTPS and mailto external links and blocks unsafe schemes", () => {
    expect(classifyDesktopNavigation("https://docs.example/help", origin)).toBe(
      "external",
    );
    expect(
      classifyDesktopNavigation("mailto:support@example.test", origin),
    ).toBe("external");
    expect(classifyDesktopNavigation("file:///etc/passwd", origin)).toBe(
      "block",
    );
    expect(classifyDesktopNavigation("javascript:alert(1)", origin)).toBe(
      "block",
    );
    expect(classifyDesktopNavigation("not a URL", origin)).toBe("block");
  });
});
