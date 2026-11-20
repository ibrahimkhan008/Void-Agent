import { describe, expect, it } from "vitest";
import {
  appendLearningEntry,
  buildDefaultLearningFileContent,
  countLearningEntries,
  filterNewFindings,
  parseStructuredJson,
} from "./self-learning-utils";

describe("cyber self-learning playbook & Finding Scribe helpers", () => {
  it("appends timestamped markdown learning entries and deduplicates repeats", () => {
    const base = buildDefaultLearningFileContent();
    const first = appendLearningEntry(
      base,
      {
        topic: "Cloudflare Worker Auth Bypass",
        targetContext: "edge-api.example.com",
        lessons: [
          "Always test trailing slash and double-encoded path normalization on edge routes.",
        ],
        tactics: [
          "Compare upstream origin routing vs Worker middleware path regex.",
        ],
        pitfalls: ["Do not mistake cached 304 responses for auth bypass."],
      },
      "2026-11-20T14:30:00.000Z",
    );

    expect(first.added).toBe(true);
    expect(first.markdown).toContain(
      "## 2026-11-20 14:30 UTC — Cloudflare Worker Auth Bypass",
    );
    expect(first.markdown).toContain("edge-api.example.com");
    expect(countLearningEntries(first.markdown)).toBe(1);

    // Repeating identical lessons should not duplicate the entry
    const duplicate = appendLearningEntry(
      first.markdown,
      {
        topic: "Cloudflare Worker Auth Bypass",
        lessons: [
          "Always test trailing slash and double-encoded path normalization on edge routes.",
        ],
        tactics: [
          "Compare upstream origin routing vs Worker middleware path regex.",
        ],
        pitfalls: ["Do not mistake cached 304 responses for auth bypass."],
      },
      "2026-11-20T14:35:00.000Z",
    );

    expect(duplicate.added).toBe(false);
    expect(countLearningEntries(duplicate.markdown)).toBe(1);
  });

  it("parses JSON wrapped in markdown code fences safely", () => {
    const raw =
      '```json\n{"learning":{"shouldSave":true,"topic":"IDOR"},"findings":[]}\n```';
    const parsed = parseStructuredJson<{
      learning: { shouldSave: boolean; topic: string };
      findings: unknown[];
    }>(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.learning.shouldSave).toBe(true);
    expect(parsed?.learning.topic).toBe("IDOR");
  });

  it("filters, normalizes, and deduplicates Finding Scribe candidate bugs", () => {
    const existing = [
      {
        title: "IDOR on /api/v1/invoices/:id",
        affectedAsset: "api.example.com",
      },
    ];
    const filtered = filterNewFindings(
      [
        {
          title: "IDOR on /api/v1/invoices/:id",
          severity: "HIGH",
          affectedAsset: "api.example.com",
        },
        {
          title: "Reflected XSS in search query parameter",
          severity: "HIGH",
          affectedAsset: "app.example.com/search",
          cweId: "CWE-79",
          reproductionSteps: "1. Navigate to /search?q=<svg/onload=alert(1)>",
          proofOfConcept: "GET /search?q=%3Csvg%2Fonload%3Dalert(1)%3E",
          impactDescription:
            "Allows script execution in victim browser context.",
        },
        { title: "bad", severity: "critical", affectedAsset: "" },
      ],
      existing,
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Reflected XSS in search query parameter");
    expect(filtered[0].severity).toBe("high");
    expect(filtered[0].cweId).toBe("CWE-79");
  });
});
