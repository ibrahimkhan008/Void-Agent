import { describe, expect, it } from "vitest";
import { parseSecureUpdateFeed } from "./update-feed";

describe("parseSecureUpdateFeed", () => {
  it("parses HTTPS generic feeds with quoted or plain YAML values", () => {
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
  });

  it.each([
    "http://updates.example/app",
    "https://user:password@updates.example/app",
    "https://updates.example/app?token=secret",
    "https://updates.example/app#fragment",
    "not-a-url",
  ])("rejects unsafe or invalid feed %s", (url) => {
    expect(parseSecureUpdateFeed(`url: ${url}`)).toBeNull();
  });

  it("returns null when the build contains no feed", () => {
    expect(parseSecureUpdateFeed('provider: generic\nurl: ""\n')).toBeNull();
  });
});
