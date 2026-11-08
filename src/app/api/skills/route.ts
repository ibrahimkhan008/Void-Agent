import { UserPreferences, UserSkill } from "app-types/user";
import { getSession } from "auth/server";
import { getUserSkillsFromPreferences, sanitizeSkillName } from "lib/ai/skills";
import { userRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { hasSameOrigin } from "lib/security/same-origin";
import { isSupportedSkillLicense } from "lib/skills/registry";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_SKILLS = 200;
const MAX_NAME_LENGTH = 64;
const MAX_MARKDOWN_LENGTH = 120_000;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_SKILL_REQUEST_BYTES = 512_000;
const privateJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init?.headers },
  });

const sanitizeDescription = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_DESCRIPTION_LENGTH);
};

const updateUserSkills = async (userId: string, skills: UserSkill[]) => {
  const preferences = await userRepository.getPreferences(userId);
  const nextPreferences: UserPreferences = {
    ...(preferences ?? {}),
    skills,
  };
  await userRepository.updatePreferences(userId, nextPreferences);
};

const mapApiSkill = (
  skill: ReturnType<typeof getUserSkillsFromPreferences>[number],
) => ({
  id: skill.id,
  name: skill.name,
  markdown: skill.markdown,
  description: skill.description,
  source: skill.source,
  slug: skill.slug,
  license: skill.license,
  licenseNotice: skill.licenseNotice,
  sourceUrl: skill.sourceUrl,
  createdAt: skill.createdAt,
  updatedAt: skill.updatedAt,
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences).map(mapApiSkill);
    return privateJson({ skills });
  } catch (error: any) {
    return privateJson(
      { error: error.message || "Failed to fetch skills" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasSameOrigin(request)) {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }
    const session = await getSession();
    if (!session?.user?.id) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const boundedBody = await readBoundedJsonRequest(
      request,
      MAX_SKILL_REQUEST_BYTES,
    );
    if (!boundedBody.ok) {
      return privateJson(
        { error: boundedBody.error },
        { status: boundedBody.status },
      );
    }
    const body = boundedBody.value as Record<string, unknown>;
    const name = sanitizeSkillName(
      typeof body?.name === "string" ? body.name : "",
    );
    const markdown =
      typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const description = sanitizeDescription(body?.description);
    const importedSource =
      typeof body?.source === "string" ? body.source.trim() : "";
    const importedSlug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const importedLicense =
      typeof body?.license === "string" ? body.license.trim() : "";
    const importedLicenseNotice =
      typeof body?.licenseNotice === "string" ? body.licenseNotice.trim() : "";
    const hasImportMetadata = Boolean(
      importedSource || importedSlug || importedLicense,
    );
    if (
      hasImportMetadata &&
      (body?.importConfirmed !== true ||
        !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(
          importedSource,
        ) ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(importedSlug) ||
        !isSupportedSkillLicense(importedLicense) ||
        !importedLicenseNotice ||
        importedLicenseNotice.length > 16_384)
    ) {
      return privateJson(
        { error: "Imported skill source or license is invalid" },
        { status: 400 },
      );
    }

    if (!name || !markdown) {
      return privateJson(
        { error: "Skill name and markdown are required" },
        { status: 400 },
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      return privateJson(
        { error: `Skill name is too long. Max ${MAX_NAME_LENGTH} chars.` },
        { status: 400 },
      );
    }

    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      return privateJson(
        {
          error: `Skill markdown is too long. Max ${MAX_MARKDOWN_LENGTH} chars.`,
        },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const existingSkills = getUserSkillsFromPreferences(preferences);

    if (existingSkills.some((skill) => skill.name === name)) {
      return privateJson(
        { error: `Skill /${name} already exists` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const skill = {
      id: crypto.randomUUID(),
      name,
      markdown,
      description,
      ...(hasImportMetadata
        ? {
            source: importedSource,
            slug: importedSlug,
            license: importedLicense,
            licenseNotice: importedLicenseNotice,
            sourceUrl: `https://github.com/${importedSource}`,
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    const mergedSkills = [skill, ...existingSkills].slice(0, MAX_SKILLS);
    await updateUserSkills(session.user.id, mergedSkills);

    return privateJson(mapApiSkill(skill), { status: 201 });
  } catch (error: any) {
    return privateJson(
      { error: error.message || "Failed to create skill" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!hasSameOrigin(request)) {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }
    const session = await getSession();
    if (!session?.user?.id) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const boundedBody = await readBoundedJsonRequest(
      request,
      MAX_SKILL_REQUEST_BYTES,
    );
    if (!boundedBody.ok) {
      return privateJson(
        { error: boundedBody.error },
        { status: boundedBody.status },
      );
    }
    const body = boundedBody.value as Record<string, unknown>;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const name = sanitizeSkillName(
      typeof body?.name === "string" ? body.name : "",
    );
    const markdown =
      typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const description = sanitizeDescription(body?.description);

    if (!id || !name || !markdown) {
      return privateJson(
        { error: "Skill id, name, and markdown are required" },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences);
    const targetIndex = skills.findIndex((skill) => skill.id === id);

    if (targetIndex === -1) {
      return privateJson({ error: "Skill not found" }, { status: 404 });
    }

    const duplicate = skills.find(
      (skill) => skill.name === name && skill.id !== id,
    );
    if (duplicate) {
      return privateJson(
        { error: `Skill /${name} already exists` },
        { status: 409 },
      );
    }

    const updatedSkill = {
      ...skills[targetIndex],
      name: name.slice(0, MAX_NAME_LENGTH),
      markdown: markdown.slice(0, MAX_MARKDOWN_LENGTH),
      description,
      updatedAt: new Date().toISOString(),
    };

    const nextSkills = [...skills];
    nextSkills[targetIndex] = updatedSkill;
    await updateUserSkills(session.user.id, nextSkills);

    return privateJson(mapApiSkill(updatedSkill));
  } catch (error: any) {
    return privateJson(
      { error: error.message || "Failed to update skill" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!hasSameOrigin(request)) {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }
    const session = await getSession();
    if (!session?.user?.id) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("id");

    if (!skillId) {
      return privateJson({ error: "Skill id is required" }, { status: 400 });
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences);
    const nextSkills = skills.filter((skill) => skill.id !== skillId);

    if (nextSkills.length === skills.length) {
      return privateJson({ error: "Skill not found" }, { status: 404 });
    }

    await updateUserSkills(session.user.id, nextSkills);
    return privateJson({ success: true });
  } catch (error: any) {
    return privateJson(
      { error: error.message || "Failed to delete skill" },
      { status: 500 },
    );
  }
}
