import { describe, expect, it } from "vitest";
import {
  compileVulnerabilityReport,
  evaluateFindingQuality,
} from "./report-compiler";

describe("report-compiler", () => {
  it("scores a complete finding at 100 with zero missing-field feedback", () => {
    const result = evaluateFindingQuality({
      id: "f-1",
      title: "Stored XSS in Profile Bio Endpoint",
      severity: "high",
      status: "verified",
      affectedAsset: "https://app.example.com/api/profile",
      cweId: "CWE-79",
      cvssScore: "7.5",
      reproductionSteps:
        "1. Authenticate as a standard user.\n2. Send PATCH /api/profile with an unsanitized HTML payload.\n3. Visit the public profile page.",
      proofOfConcept:
        'curl -X PATCH https://app.example.com/api/profile -d \'{"bio":"<img src=x onerror=alert(1)>"}\'',
      impactDescription:
        "Arbitrary JavaScript executes in victim sessions, enabling session token theft and account takeover.",
      remediationGuidance:
        "HTML-encode user input on output and enforce a strict Content-Security-Policy header.",
    });

    expect(result.score).toBe(100);
    expect(result.feedback).toHaveLength(0);
  });

  it("penalizes incomplete findings and returns actionable feedback", () => {
    const result = evaluateFindingQuality({
      id: "f-2",
      title: "Bug",
      severity: "low",
      status: "candidate",
      affectedAsset: "example.com",
      reproductionSteps: "Click button",
      proofOfConcept: "none",
      impactDescription: "bad",
    });

    expect(result.score).toBeLessThan(30);
    expect(result.feedback.length).toBeGreaterThanOrEqual(5);
  });

  it("compiles sorted markdown and severity summary across multiple findings", () => {
    const compiled = compileVulnerabilityReport({
      programName: "Acme Internal",
      format: "markdown",
      generatedBy: "researcher@acme.test",
      findings: [
        {
          id: "f-low",
          title: "Missing Security Headers on Static Page",
          severity: "low",
          status: "candidate",
          affectedAsset: "docs.acme.test",
          reproductionSteps:
            "Inspect HTTP response headers with curl -I https://docs.acme.test",
          proofOfConcept: "curl -I https://docs.acme.test",
          impactDescription:
            "Missing X-Frame-Options header increases clickjacking risk.",
        },
        {
          id: "f-crit",
          title: "Unauthenticated SQL Injection in Search",
          severity: "critical",
          status: "verified",
          affectedAsset: "api.acme.test/v1/search",
          cweId: "CWE-89",
          cvssScore: "9.8",
          reproductionSteps:
            "Send a single quote in the q query parameter to observe SQL error and boolean blind extraction.",
          proofOfConcept: "GET /v1/search?q=' OR 1=1-- HTTP/1.1",
          impactDescription:
            "Full read access to application database tables including sensitive user records.",
          remediationGuidance:
            "Use parameterized queries / prepared statements for all database lookups.",
        },
      ],
    });

    expect(compiled.markdown).toContain(
      "# Void Cyber Security Assessment Report",
    );
    expect(compiled.markdown).toContain("**Target Program:** Acme Internal");
    expect(compiled.markdown).toContain("| Critical | 1 |");
    expect(compiled.markdown).toContain("| Low | 1 |");

    // Critical finding must appear before Low finding
    const critPos = compiled.markdown.indexOf("[CRITICAL]");
    const lowPos = compiled.markdown.indexOf("[LOW]");
    expect(critPos).toBeGreaterThan(-1);
    expect(lowPos).toBeGreaterThan(critPos);
    expect(compiled.qualityScore).toBeGreaterThan(50);
  });
});
