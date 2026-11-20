import { describe, expect, it } from "vitest";
import {
  type ProgramScopeAsset,
  evaluateTargetScope,
  isIpInCidr,
  isWildcardMatch,
  normalizeTargetHost,
} from "./scope-matcher";

describe("scope-matcher", () => {
  describe("normalizeTargetHost", () => {
    it("extracts hostname from full URLs", () => {
      expect(normalizeTargetHost("https://api.acme.example.com/v1/users")).toBe(
        "api.acme.example.com",
      );
      expect(
        normalizeTargetHost("http://staging.test.internal:8080/graphql"),
      ).toBe("staging.test.internal");
    });

    it("handles plain domain and IP strings", () => {
      expect(normalizeTargetHost("api.target.com")).toBe("api.target.com");
      expect(normalizeTargetHost("192.168.1.50")).toBe("192.168.1.50");
      expect(normalizeTargetHost("  sub.DOMAIN.com:443  ")).toBe(
        "sub.domain.com",
      );
    });
  });

  describe("isWildcardMatch", () => {
    it("matches single and multi-level subdomains", () => {
      expect(isWildcardMatch("*.example.com", "api.example.com")).toBe(true);
      expect(isWildcardMatch("*.example.com", "v1.api.example.com")).toBe(true);
      expect(isWildcardMatch("*.example.com", "example.com")).toBe(true);
    });

    it("rejects non-matching and malicious prefix domains", () => {
      expect(isWildcardMatch("*.example.com", "evilexample.com")).toBe(false);
      expect(isWildcardMatch("*.example.com", "example.com.attacker.com")).toBe(
        false,
      );
      expect(isWildcardMatch("*.example.com", "otherdomain.com")).toBe(false);
    });
  });

  describe("isIpInCidr", () => {
    it("matches IPs inside CIDR subnets", () => {
      expect(isIpInCidr("192.168.1.50", "192.168.1.0/24")).toBe(true);
      expect(isIpInCidr("192.168.1.1", "192.168.1.0/24")).toBe(true);
      expect(isIpInCidr("10.50.12.99", "10.0.0.0/8")).toBe(true);
    });

    it("rejects IPs outside CIDR subnets", () => {
      expect(isIpInCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
      expect(isIpInCidr("172.16.0.1", "10.0.0.0/8")).toBe(false);
    });
  });

  describe("evaluateTargetScope", () => {
    const mockScopes: ProgramScopeAsset[] = [
      {
        assetIdentifier: "*.acme.example.com",
        assetType: "wildcard",
        isInScope: true,
        instructionNotes: "Target production cluster with rate limits",
      },
      {
        assetIdentifier: "10.200.0.0/16",
        assetType: "cidr",
        isInScope: true,
      },
      {
        assetIdentifier: "admin.acme.example.com",
        assetType: "domain",
        isInScope: false, // Explicitly out of scope
        instructionNotes: "Internal auth proxy - STRICTLY FORBIDDEN",
      },
    ];

    it("allows targets matching an in-scope wildcard", () => {
      const result = evaluateTargetScope({
        target: "https://api.acme.example.com/v1/auth",
        scopes: mockScopes,
      });

      expect(result.status).toBe("allowed");
      expect(result.isInScope).toBe(true);
      expect(result.policyCitations).toContain(
        "In-Scope Asset: *.acme.example.com",
      );
    });

    it("allows targets matching an in-scope CIDR block", () => {
      const result = evaluateTargetScope({
        target: "http://10.200.5.12:8080",
        scopes: mockScopes,
      });

      expect(result.status).toBe("allowed");
      expect(result.isInScope).toBe(true);
      expect(result.policyCitations).toContain("In-Scope Asset: 10.200.0.0/16");
    });

    it("strictly blocks targets matching explicit out-of-scope assets", () => {
      const result = evaluateTargetScope({
        target: "https://admin.acme.example.com/login",
        scopes: mockScopes,
      });

      expect(result.status).toBe("disallowed");
      expect(result.isInScope).toBe(false);
      expect(result.reason).toContain(
        "explicitly prohibited out-of-scope asset",
      );
    });

    it("blocks targets that do not match any in-scope definition", () => {
      const result = evaluateTargetScope({
        target: "https://unrelated-third-party.com",
        scopes: mockScopes,
      });

      expect(result.status).toBe("disallowed");
      expect(result.isInScope).toBe(false);
    });

    it("blocks tasks requesting prohibited vulnerability categories", () => {
      const result = evaluateTargetScope({
        target: "https://api.acme.example.com",
        scopes: mockScopes,
        category: "Denial of Service",
        excludedCategories: ["Denial of Service", "Social Engineering"],
      });

      expect(result.status).toBe("disallowed");
      expect(result.isCategoryExcluded).toBe(true);
      expect(result.reason).toContain("strictly excluded by program policy");
    });

    it("flags in-scope tasks as conditional when marked intrusive", () => {
      const result = evaluateTargetScope({
        target: "https://api.acme.example.com",
        scopes: mockScopes,
        isIntrusive: true,
      });

      expect(result.status).toBe("conditional");
      expect(result.isInScope).toBe(true);
      expect(result.reason).toContain("Human approval required");
    });
  });
});
