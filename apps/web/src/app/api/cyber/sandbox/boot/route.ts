import { requireCyberAccess } from "lib/cyber/auth";
import { getCyberSystemConfig } from "lib/cyber/config";
import { bootCyberSandboxWithSkills } from "lib/cyber/sandbox-boot";
import { getOrInitializeCyberLearningFile } from "lib/cyber/self-learning";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => ({}));
  const requestedSlugs: string[] | null = Array.isArray(body.skillSlugs)
    ? body.skillSlugs.filter((s: unknown): s is string => typeof s === "string")
    : null;

  const [config, learningFile] = await Promise.all([
    getCyberSystemConfig(),
    getOrInitializeCyberLearningFile(access.session.user.id),
  ]);
  const skillsToHook = requestedSlugs
    ? config.builtinSkills.filter((s) => requestedSlugs.includes(s.slug))
    : config.builtinSkills;

  const result = await bootCyberSandboxWithSkills({
    userId: access.session.user.id,
    skills: skillsToHook,
    selfLearningMarkdown: learningFile.contentMarkdown,
    requestId: `cyber-${Date.now()}`,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "cyber_sandbox_booted",
      severity: result.status === "error" ? "warning" : "info",
      details: {
        status: result.status,
        sandboxId: result.sandboxId,
        skills: result.hookedSkills.map((s) => ({
          slug: s.slug,
          status: s.status,
        })),
      },
    })
    .catch(() => {});

  return NextResponse.json(result);
}
