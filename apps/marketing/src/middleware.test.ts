import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function requestFor(host: string, path = "/") {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host },
  });
}

describe("marketing middleware (www → apex)", () => {
  it("redirects www.voidagent.space to the apex with 308, preserving the path", () => {
    const res = middleware(requestFor("www.voidagent.space", "/pricing?x=1"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://voidagent.space/pricing?x=1",
    );
  });

  it("passes the apex host through", () => {
    const res = middleware(requestFor("voidagent.space", "/pricing"));
    expect(res.status).toBe(200);
  });

  it("passes localhost dev hosts through", () => {
    const res = middleware(requestFor("localhost:3001", "/pricing"));
    expect(res.status).toBe(200);
  });

  it("rewrites / to the landing page (URL stays /)", () => {
    const res = middleware(requestFor("voidagent.space", "/"));
    // Rewrites answer 200 with the rewritten content.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/landing");
  });
});
