import { withAuth } from "auth/route-guard";
import JSZip from "jszip";
import { skillRepository } from "lib/db/repository";
import {
  parseFrontmatterDescription,
  stripFrontmatter,
  toSkillSlug,
} from "lib/skills/fetch-skill-content";

/**
 * ZIP-archive skill import (master prompt §3.12): a user uploads a .zip of
 * skill folders — each skill MUST be a folder containing a SKILL.md at its
 * root (the Agent Skills spec); arbitrary other files/folders are ignored.
 * Every qualifying SKILL.md is imported as one skill, frontmatter stripped,
 * exactly like the registry/file/URL import paths.
 */

const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_BYTES = 200 * 1024;
const MAX_SKILLS_PER_ZIP = 50;

function frontmatterName(markdown: string): string | undefined {
  const fm = markdown.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/);
  const line = fm?.[1].match(/^name:\s*(.+)$/m);
  const value = line?.[1].trim().replace(/^["']|["']$/g, "");
  return value?.length ? value : undefined;
}

function slugify(value: string): string {
  const slug =
    toSkillSlug(value) ||
    value
      .toLowerCase()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return slug || "imported-skill";
}

export const POST = withAuth(async (request, session) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Attach a .zip file" }, { status: 400 });
  }
  if (file.size > MAX_ZIP_BYTES) {
    return Response.json(
      { error: "That archive is too large (10 MB max)." },
      { status: 413 },
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return Response.json(
      { error: "That file is not a valid .zip." },
      { status: 422 },
    );
  }

  // Skill folders = the directories that directly contain a SKILL.md.
  const folders = new Map<string, string>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const parts = entry.name.split("/");
    const base = parts[parts.length - 1];
    if (base.toLowerCase() !== "skill.md") continue;
    const folder = parts.slice(0, -1).join("/");
    if (!folder) continue;
    folders.set(folder, entry.name);
  }

  if (!folders.size) {
    return Response.json(
      {
        error:
          "No SKILL.md files found. Each skill must be a folder with a SKILL.md at its root.",
      },
      { status: 422 },
    );
  }

  // GitHub "Download ZIP" archives wrap everything in `<repo>-main/`. When
  // every skill folder shares that single top-level segment, strip it so the
  // skill names come from the real skill folders.
  const paths = [...folders.keys()];
  const firstSegments = new Set(paths.map((p) => p.split("/")[0]));
  const needsStrip =
    firstSegments.size === 1 && paths.some((p) => p.includes("/"));

  const imported: Array<{ name: string; slug: string }> = [];
  const failed: Array<{ folder: string; error: string }> = [];
  const usedSlugs = new Set<string>();

  const zipBase = slugify(file.name.replace(/\.zip$/i, ""));
  const source = `local/${zipBase}`.slice(0, 200);

  for (const [folder, entryName] of folders) {
    if (imported.length >= MAX_SKILLS_PER_ZIP) {
      failed.push({
        folder,
        error: "Archive contains too many skills (50 max).",
      });
      continue;
    }
    try {
      const raw = await zip.file(entryName)!.async("string");
      if (raw.length > MAX_SKILL_BYTES) {
        failed.push({ folder, error: "SKILL.md too large (200 KB max)." });
        continue;
      }
      const body = stripFrontmatter(raw);
      if (!body.length) {
        failed.push({ folder, error: "SKILL.md has no content." });
        continue;
      }

      const folderSegments = needsStrip
        ? folder.split("/").slice(1)
        : folder.split("/");
      const folderName = folderSegments[folderSegments.length - 1] || folder;
      const name = (frontmatterName(raw) || folderName).slice(0, 200);

      let slug = slugify(folderName);
      while (usedSlugs.has(slug)) slug = `${slug}-2`;
      usedSlugs.add(slug);

      const skill = await skillRepository.insertSkill({
        name,
        description: parseFrontmatterDescription(raw),
        slug,
        source,
        content: body,
        visibility: "private",
        userId: session.user.id,
        organizationId:
          (
            session.session as
              | { activeOrganizationId?: string | null }
              | undefined
          )?.activeOrganizationId ?? null,
      });
      imported.push({ name: skill.name, slug: skill.slug });
    } catch (error) {
      failed.push({
        folder,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  if (!imported.length) {
    return Response.json(
      {
        error:
          failed[0]?.error ?? "Nothing could be imported from that archive.",
      },
      { status: 422 },
    );
  }
  return Response.json({ imported, failed });
});
