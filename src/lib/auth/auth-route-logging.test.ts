import { describe, expect, it } from "vitest";
import {
  getAuthErrorLogContext,
  getAuthRequestLogContext,
} from "./auth-route-logging";

describe("auth route error logging context", () => {
  it("keeps credential values and query-string reset tokens out of logs", async () => {
    const context = await getAuthRequestLogContext(
      new Request(
        "https://void.test/api/auth/reset-password?token=query-secret",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "person@example.com",
            password: "body-secret",
            token: "reset-secret",
          }),
        },
      ),
    );
    const serialized = JSON.stringify(context);
    expect(context).toEqual({
      method: "POST",
      pathname: "/api/auth/reset-password",
      bodyKeys: ["email", "password", "token"],
    });
    expect(serialized).not.toContain("body-secret");
    expect(serialized).not.toContain("reset-secret");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("person@example.com");
  });

  it("handles non-JSON bodies without logging their content", async () => {
    expect(
      await getAuthRequestLogContext(
        new Request("https://void.test/api/auth/sign-in", {
          method: "POST",
          body: "password=secret",
        }),
      ),
    ).toEqual({ method: "POST", pathname: "/api/auth/sign-in" });
  });

  it("keeps exception details out of auth route telemetry", async () => {
    const context = await getAuthErrorLogContext(
      new Request("https://void.test/api/auth/reset-password"),
      new Error("database error included reset-secret"),
    );
    expect(context).toEqual({
      method: "GET",
      pathname: "/api/auth/reset-password",
      errorType: "Error",
    });
    expect(JSON.stringify(context)).not.toContain("reset-secret");
  });
});
