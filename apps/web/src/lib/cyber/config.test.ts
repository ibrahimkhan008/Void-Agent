import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  buildDefaultCyberConfig,
  isValidSkillRepoUrl,
  sanitizeSkillSlug,
} from "./config";

describe("cyber config & E2B skill registry", () => {
  it("pre-seeds cloudflare, Claude-BugHunter, SubdomainX, and secskills enabled by default", () => {
    const cfg = buildDefaultCyberConfig();
    const expected: Record<string, string> = {
      "cloudflare-security-audit":
        "https://github.com/cloudflare/security-audit-skill.git",
      "claude-bughunter":
        "https://github.com/elementalsouls/Claude-BugHunter.git",
      subdomainx: "https://github.com/elementalsouls/SubdomainX.git",
      secskills: "https://github.com/trilwu/secskills.git",
    };

    for (const [slug, repoUrl] of Object.entries(expected)) {
      const skill = cfg.builtinSkills.find((s) => s.slug === slug);
      expect(skill).toBeDefined();
      expect(skill?.repoUrl).toBe(repoUrl);
      expect(skill?.enabled).toBe(true);
      expect(skill?.mountPath).toBe(`/home/user/skills/${slug}`);
    }
  });

  it("validates HTTPS skill repo URLs and rejects unsafe schemes or localhost", () => {
    expect(
      isValidSkillRepoUrl(
        "https://github.com/cloudflare/security-audit-skill.git",
      ),
    ).toBe(true);
    expect(isValidSkillRepoUrl("http://github.com/org/repo.git")).toBe(false);
    expect(isValidSkillRepoUrl("file:///etc/passwd")).toBe(false);
    expect(isValidSkillRepoUrl("https://localhost/repo.git")).toBe(false);
  });

  it("sanitizes skill slugs safely for E2B mount paths", () => {
    expect(sanitizeSkillSlug("Cloudflare Security Audit!!")).toBe(
      "cloudflare-security-audit",
    );
    expect(sanitizeSkillSlug("../evil; rm -rf /")).toBe("evil-rm-rf");
  });

  it("defines default plan limits for every Void Agent subscription tier", () => {
    const cfg = buildDefaultCyberConfig();
    expect(cfg.planLimits.free.maxConcurrentAgents).toBe(1);
    expect(cfg.planLimits.free.maxActiveCyberSessions).toBe(1);
    expect(cfg.planLimits["voidagent-pro"].maxConcurrentAgents).toBeGreaterThan(
      cfg.planLimits.free.maxConcurrentAgents,
    );
    expect(
      cfg.planLimits["voidagent-enterprises-max"].maxActiveCyberSessions,
    ).toBeGreaterThanOrEqual(20);
  });
});
