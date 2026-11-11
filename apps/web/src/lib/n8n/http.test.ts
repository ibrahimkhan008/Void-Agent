import { describe, expect, it } from "vitest";
import { isSameOriginN8nRequest, readN8nJson } from "./http";

describe("n8n request boundary helpers", () => {
  it("accepts bounded JSON and rejects malformed or oversized bodies", async () => {
    const valid = await readN8nJson(
      new Request("https://app.example/api", {
        method: "POST",
        body: JSON.stringify({ value: "ok" }),
      }),
    );
    expect(valid).toEqual({ ok: true, value: { value: "ok" } });

    const invalid = await readN8nJson(
      new Request("https://app.example/api", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(invalid).toEqual({ ok: false, reason: "invalid" });

    const oversized = await readN8nJson(
      new Request("https://app.example/api", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(20) }),
      }),
      10,
    );
    expect(oversized).toEqual({ ok: false, reason: "too_large" });
  });

  it("requires a valid same-origin header and rejects cross-site fetches", () => {
    const create = (headers: Record<string, string>) =>
      new Request("https://app.example/api", { headers });

    expect(
      isSameOriginN8nRequest(create({ origin: "https://app.example" })),
    ).toBe(true);
    expect(
      isSameOriginN8nRequest(create({ origin: "https://attacker.example" })),
    ).toBe(false);
    expect(
      isSameOriginN8nRequest(
        create({
          origin: "https://app.example",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
    expect(isSameOriginN8nRequest(create({}))).toBe(false);
  });
});
