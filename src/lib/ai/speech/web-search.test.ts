import { afterEach, describe, expect, it, vi } from "vitest";
import { searchVoiceWeb } from "./web-search";

afterEach(() => vi.unstubAllGlobals());

describe("searchVoiceWeb", () => {
  it("posts a bounded query to the same-origin route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        sources: [],
        sourceDataIsUntrusted: true,
        instruction: "untrusted",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchVoiceWeb("  local news today ")).resolves.toMatchObject({
      sources: [],
      sourceDataIsUntrusted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "local news today" }),
    });
  });

  it("rejects bad queries before network access and handles route errors", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchVoiceWeb("x")).rejects.toThrow("2 and 500 characters");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "Public web search is temporarily unavailable." },
            { status: 502 },
          ),
        ),
    );
    await expect(searchVoiceWeb("some query")).rejects.toThrow(
      "temporarily unavailable",
    );
  });
});
