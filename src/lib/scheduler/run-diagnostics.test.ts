import { describe, expect, it } from "vitest";
import { getScheduledRunFailureDiagnostic } from "./run-diagnostics";

describe("getScheduledRunFailureDiagnostic", () => {
  it("maps known chat status codes to actionable safe diagnostics", () => {
    expect(
      getScheduledRunFailureDiagnostic("chat-api-401: private response"),
    ).toEqual({
      code: "authentication",
      message: "The scheduler could not authenticate this run.",
    });
    expect(
      getScheduledRunFailureDiagnostic("chat-api-429: private response")?.code,
    ).toBe("rate-limited");
    expect(
      getScheduledRunFailureDiagnostic("chat-api-503: private response")?.code,
    ).toBe("service-error");
  });

  it("does not expose provider output, prompts, or arbitrary internal errors", () => {
    const diagnostic = getScheduledRunFailureDiagnostic(
      "provider response contains secret token and user prompt",
    );
    expect(diagnostic).toEqual({
      code: "unknown",
      message: "This run failed. Check the scheduler configuration and retry.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret token");
    expect(getScheduledRunFailureDiagnostic(null)).toBeNull();
  });

  it("identifies an interrupted worker lease without returning internal details", () => {
    expect(
      getScheduledRunFailureDiagnostic(
        "Manual run not replayed after worker lease expiry.",
      ),
    ).toEqual({
      code: "worker-interrupted",
      message: "The worker stopped during this run. Queue a new run to retry.",
    });
  });
});
