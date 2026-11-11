import { describe, expect, it } from "vitest";
import {
  parseSecureUpdateFeed,
  parseSecureUpdateFeedUrl,
} from "./secure-update-feed.js";

describe("secure desktop update feed", () => {
  it("normalizes HTTPS generic feeds from YAML or runtime config", () => {
    expect(
      parseSecureUpdateFeed(
        'provider: generic\nurl: "https://updates.example/app"',
      ),
    ).toBe("https://updates.example/app/");
    expect(
      parseSecureUpdateFeed(
        "provider: generic\nurl: https://updates.example/app/",
      ),
    ).toBe("https://updates.example/app/");
    expect(parseSecureUpdateFeedUrl(" https://updates.example/app ")).toBe(
      "https://updates.example/app/",
    );
  });

  it.each([
    "http://updates.example/app",
    "https://user:password@updates.example/app",
    "https://updates.example/app?token=secret",
    "https://updates.example/app#fragment",
    "https://updates.example/app\nurl: https://attacker.example/feed",
    "not-a-url",
  ])("rejects unsafe or invalid feed %s", (url) => {
    expect(parseSecureUpdateFeedUrl(url)).toBeNull();
    expect(parseSecureUpdateFeed(`url: ${url}`)).toBeNull();
  });

  it("rejects ambiguous config with multiple update feed keys", () => {
    expect(
      parseSecureUpdateFeed(
        "url: https://updates.example/app\nurl: https://attacker.example/feed",
      ),
    ).toBeNull();
  });

  it("returns null when the build contains no feed", () => {
    expect(parseSecureUpdateFeed('provider: generic\nurl: ""\n')).toBeNull();
  });
});
