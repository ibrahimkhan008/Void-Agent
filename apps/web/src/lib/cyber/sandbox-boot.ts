import "server-only";

import {
  EXEC_SANDBOX_TIMEOUT_MS,
  createSandbox,
  toSandboxErrorResponse,
} from "lib/e2b/create-sandbox";
import logger from "lib/logger";
import {
  type CyberBuiltinSkill,
  isValidSkillRepoUrl,
  sanitizeSkillSlug,
} from "./config";
import { SELF_LEARNING_E2B_MOUNT_PATH } from "./self-learning-utils";

export interface HookedSkillResult {
  slug: string;
  name: string;
  repoUrl: string;
  mountPath: string;
  status: "hooked" | "failed" | "skipped";
  skillDoc?: string;
  error?: string;
}

export interface CyberSandboxBootResult {
  status: "ready" | "unconfigured" | "error";
  sandboxId: string | null;
  hookedSkills: HookedSkillResult[];
  message: string;
}

/**
 * Boots an isolated E2B sandbox for Void Cyber and automatically clones + hooks
 * all enabled built-in Cyber Skills (e.g. cloudflare/security-audit-skill)
 * into `/home/user/skills/<slug>`, reading each skill's SKILL.md / README.md
 * so the Cyber AI agent can immediately apply them.
 */
export async function bootCyberSandboxWithSkills({
  userId,
  skills,
  selfLearningMarkdown,
  requestId = "cyber-boot",
}: {
  userId: string;
  skills: CyberBuiltinSkill[];
  selfLearningMarkdown?: string;
  requestId?: string;
}): Promise<CyberSandboxBootResult> {
  const enabledSkills = skills.filter((s) => s.enabled);

  if (!process.env.E2B_API_KEY) {
    return {
      status: "unconfigured",
      sandboxId: null,
      hookedSkills: enabledSkills.map((s) => ({
        slug: s.slug,
        name: s.name,
        repoUrl: s.repoUrl,
        mountPath: s.mountPath,
        status: "skipped",
        error: "E2B_API_KEY is not configured in environment",
      })),
      message:
        "E2B sandbox API key (E2B_API_KEY) is not configured locally. Built-in skills are registered and ready to auto-hook as soon as E2B_API_KEY is set.",
    };
  }

  const template = process.env.E2B_EXECUTION_TEMPLATE || "base";

  try {
    const sbx = await createSandbox(template, {
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: EXEC_SANDBOX_TIMEOUT_MS * 3, // 15 min research window
      billing: {
        userId,
        customerId: null,
        entityId: "void-cyber",
      },
      requestId,
      metadata: {
        purpose: "void-cyber",
        hookedSkillCount: String(enabledSkills.length),
      },
    });

    await sbx.commands.run("mkdir -p /home/user/skills", {
      timeoutMs: 15_000,
    });

    const hookedSkills: HookedSkillResult[] = [];

    for (const skill of enabledSkills) {
      const safeSlug = sanitizeSkillSlug(skill.slug);
      const mountPath = `/home/user/skills/${safeSlug}`;

      if (!safeSlug || !isValidSkillRepoUrl(skill.repoUrl)) {
        hookedSkills.push({
          slug: skill.slug,
          name: skill.name,
          repoUrl: skill.repoUrl,
          mountPath,
          status: "failed",
          error: "Invalid skill repository URL or slug",
        });
        continue;
      }

      try {
        // Safe single-quoted shell invocation; URL validated as HTTPS above
        const escapedUrl = skill.repoUrl.replace(/'/g, "'\\''");
        const cloneRes = await sbx.commands.run(
          `rm -rf '${mountPath}' && git clone --depth 1 '${escapedUrl}' '${mountPath}'`,
          { timeoutMs: 45_000 },
        );

        if (cloneRes.exitCode !== 0) {
          hookedSkills.push({
            slug: safeSlug,
            name: skill.name,
            repoUrl: skill.repoUrl,
            mountPath,
            status: "failed",
            error: (cloneRes.stderr || "git clone failed").slice(0, 300),
          });
          continue;
        }

        // Read SKILL.md or README.md from the cloned skill so the AI agent has its instructions
        let skillDoc = "";
        const docCmd = await sbx.commands.run(
          `if [ -f '${mountPath}/SKILL.md' ]; then head -c 4000 '${mountPath}/SKILL.md'; elif [ -f '${mountPath}/README.md' ]; then head -c 4000 '${mountPath}/README.md'; fi`,
          { timeoutMs: 10_000 },
        );
        if (docCmd.exitCode === 0 && docCmd.stdout) {
          skillDoc = docCmd.stdout.trim();
        }

        hookedSkills.push({
          slug: safeSlug,
          name: skill.name,
          repoUrl: skill.repoUrl,
          mountPath,
          status: "hooked",
          skillDoc: skillDoc || undefined,
        });
      } catch (err) {
        hookedSkills.push({
          slug: safeSlug,
          name: skill.name,
          repoUrl: skill.repoUrl,
          mountPath,
          status: "failed",
          error: err instanceof Error ? err.message : "Skill hook error",
        });
      }
    }

    // Mount the researcher's self-learning playbook directly inside E2B
    if (selfLearningMarkdown && selfLearningMarkdown.trim().length > 0) {
      try {
        await sbx.commands.run("mkdir -p /home/user/skills/self-learned", {
          timeoutMs: 10_000,
        });
        await sbx.files.write(
          SELF_LEARNING_E2B_MOUNT_PATH,
          selfLearningMarkdown,
        );
        hookedSkills.push({
          slug: "self-learned",
          name: "Bug Bounty Self-Learning Playbook",
          repoUrl: "local://bugbounty-self-learning.md",
          mountPath: SELF_LEARNING_E2B_MOUNT_PATH,
          status: "hooked",
          skillDoc: selfLearningMarkdown.slice(0, 4000),
        });
      } catch (err) {
        logger.warn(
          "[cyber-sandbox] failed to mount self-learning file:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    const hookedCount = hookedSkills.filter(
      (s) => s.status === "hooked",
    ).length;
    logger.info(
      `[cyber-sandbox] booted sbxId=${sbx.sandboxId} userId=${userId} hookedSkills=${hookedCount}/${enabledSkills.length}`,
    );

    return {
      status: "ready",
      sandboxId: sbx.sandboxId,
      hookedSkills,
      message: `E2B sandbox ${sbx.sandboxId} booted with ${hookedCount}/${enabledSkills.length} cyber skill(s) hooked.`,
    };
  } catch (err) {
    const mapped = toSandboxErrorResponse(err, template);
    logger.error("[cyber-sandbox] boot failed", mapped.message);
    return {
      status: "error",
      sandboxId: null,
      hookedSkills: enabledSkills.map((s) => ({
        slug: s.slug,
        name: s.name,
        repoUrl: s.repoUrl,
        mountPath: s.mountPath,
        status: "failed",
        error: mapped.message,
      })),
      message: mapped.message,
    };
  }
}
