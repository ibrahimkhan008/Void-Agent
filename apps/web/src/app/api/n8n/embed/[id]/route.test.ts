import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("retired n8n editor embed route", () => {
  it("does not mint a native editor session token", async () => {
    const response = await GET();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "The embedded workflow editor is disabled.",
    });
  });
});
