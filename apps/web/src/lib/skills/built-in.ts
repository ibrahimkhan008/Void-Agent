import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The system default skills, read from `apps/web/skills/` (see the README
 * there for the folder convention: `<category>/<slug>/SKILL.md`). These ship
 * with the product and install offline — no registry round trip.
 *
 * Path resolution mirrors how the migrations folder is located: try the
 * process cwd first, then the workspace-relative layout, then an explicit
 * `SKILLS_DIR` override for non-standard deployments.
 */
export interface BuiltInSkill {
  category: string;
  /** Folder name; the install slug. */
  slug: string;
  name: string;
  description?: string;
  /** Frontmatter-stripped SKILL.md body. Populated only when requested. */
  content?: string;
  /** Provenance from a pack-level manifest.json, when present. */
  source?: string;
  bytes: number;
}

function candidates(): string[] {
  const explicit = process.env.SKILLS_DIR?.trim();
  const list = explicit
    ? [explicit]
    : [
        path.join(process.cwd(), "skills"),
        path.join(process.cwd(), "apps", "web", "skills"),
      ];
  return list;
}

function skillsRoot(): string | null {
  for (const candidate of candidates()) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Unreadable candidate — try the next one.
    }
  }
  return null;
}

/** YAML frontmatter `field:` value from a SKILL.md, when present. */
function frontmatterField(markdown: string, field: string): string | undefined {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = fm?.[1].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  const value = line?.[1].trim().replace(/^["']|["']$/g, "");
  return value?.length ? value : undefined;
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = match ? markdown.slice(match[0].length) : markdown;
  return body.trim();
}

function packSource(packDir: string): string | undefined {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"),
    ) as { source?: string };
    return manifest.source;
  } catch {
    return undefined;
  }
}

/**
 * List every built-in skill. `withContent` also carries the full SKILL.md
 * body (used by the single-skill fetch, not the catalog list).
 */
export function listBuiltInSkills(withContent = false): BuiltInSkill[] {
  const root = skillsRoot();
  if (!root) return [];

  const skills: BuiltInSkill[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const packDir = path.join(root, entry.name);
    const category = entry.name;
    const source = packSource(packDir);

    for (const skillDir of fs.readdirSync(packDir, { withFileTypes: true })) {
      if (!skillDir.isDirectory()) continue;
      const skillMd = path.join(packDir, skillDir.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;

      const raw = fs.readFileSync(skillMd, "utf8");
      const name =
        frontmatterField(raw, "name") ??
        skillDir.name
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      skills.push({
        category,
        slug: skillDir.name,
        name,
        description: frontmatterField(raw, "description"),
        ...(withContent ? { content: stripFrontmatter(raw) } : {}),
        source,
        bytes: Buffer.byteLength(raw, "utf8"),
      });
    }
  }
  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug),
  );
}

/** One built-in skill with content, or null when the slug is unknown. */
export function getBuiltInSkill(
  category: string,
  slug: string,
): BuiltInSkill | null {
  // Path traversal guard: category/slug must be plain folder names.
  if (!/^[a-z0-9-]+$/i.test(category) || !/^[a-z0-9-]+$/i.test(slug)) {
    return null;
  }
  return (
    listBuiltInSkills(true).find(
      (skill) => skill.category === category && skill.slug === slug,
    ) ?? null
  );
}
