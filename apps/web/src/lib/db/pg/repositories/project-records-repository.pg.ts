import { and, asc, desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { ProjectBrainPageTable, ProjectBrainRevisionTable } from "../schema.pg";

/**
 * The Void Agent structured project records (master prompt §3.3): nine
 * well-known, per-project markdown documents — MEMORY.md, TODO.md, DONT.md,
 * RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md and
 * DEPLOYMENT.md — stored as first-class brain pages (type "document") with a
 * full revision history. Every save appends a revision; restores append the
 * restored content as a NEW revision, so history never rewrites itself.
 *
 * These pages are ordinary brain pages, which means the existing brain
 * retrieval, graph and consolidation cycles see them — the agent reads the
 * records as project context without any special-casing.
 */

export const PROJECT_RECORDS = [
  {
    slug: "records/memory",
    title: "MEMORY.md",
    purpose: "What the project is, decisions made, and current state.",
    template:
      "# Memory\n\nWhat this project is, what has been decided, and where things stand.\n\n- \n",
  },
  {
    slug: "records/todo",
    title: "TODO.md",
    purpose: "Open work, next steps, and blockers.",
    template: "# TODO\n\n- [ ] \n",
  },
  {
    slug: "records/dont",
    title: "DONT.md",
    purpose: "Things the agents must never do in this project.",
    template:
      "# DONT\n\nHard limits. Every entry here is a hard stop for all agents.\n\n- \n",
  },
  {
    slug: "records/rules",
    title: "RULES.md",
    purpose: "Project rules and conventions the agents must follow.",
    template:
      "# Rules\n\nConventions and constraints for this project.\n\n- \n",
  },
  {
    slug: "records/style",
    title: "STYLE.md",
    purpose: "Design, tone, and formatting preferences.",
    template: "# Style\n\nTone, formatting, and design preferences.\n\n- \n",
  },
  {
    slug: "records/architecture",
    title: "ARCHITECTURE.md",
    purpose: "How the system is structured and why.",
    template:
      "# Architecture\n\nHow this project is structured, and the reasoning behind it.\n\n- \n",
  },
  {
    slug: "records/decisions",
    title: "DECISIONS.md",
    purpose: "Decision records: what was decided, when, and why.",
    template: "# Decisions\n\n- \n",
  },
  {
    slug: "records/security",
    title: "SECURITY.md",
    purpose: "Security constraints, secrets policy, and threat model notes.",
    template:
      "# Security\n\nConstraints and policies that protect this project.\n\n- \n",
  },
  {
    slug: "records/deployment",
    title: "DEPLOYMENT.md",
    purpose: "How this project ships: environments, steps, and rollback.",
    template:
      "# Deployment\n\nHow this project ships, and what rollback looks like.\n\n- \n",
  },
] as const;

export type ProjectRecordSlug = (typeof PROJECT_RECORDS)[number]["slug"];

export interface ProjectRecordView {
  slug: string;
  title: string;
  purpose: string;
  content: string;
  revision: number;
  updatedAt: string;
  revisionCount: number;
}

const TYPE = "document";

async function ensureRecord(
  projectId: string,
  userId: string,
  def: (typeof PROJECT_RECORDS)[number],
): Promise<string> {
  const existing = await pgDb
    .select({ id: ProjectBrainPageTable.id })
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, projectId),
        eq(ProjectBrainPageTable.slug, def.slug),
      ),
    )
    .limit(1);
  if (existing.length) return existing[0].id;

  const inserted = await pgDb
    .insert(ProjectBrainPageTable)
    .values({
      projectId,
      userId,
      slug: def.slug,
      type: TYPE,
      title: def.title,
      compiledTruth: def.template,
      summary: def.purpose,
      frontmatter: { record: true, purpose: def.purpose },
    })
    .returning({ id: ProjectBrainPageTable.id });

  const pageId = inserted[0].id;
  await pgDb.insert(ProjectBrainRevisionTable).values({
    projectId,
    pageId,
    revision: 1,
    content: def.template,
    changeNote: "Record created",
    userId,
  });
  return pageId;
}

/** Ensures all nine records exist for the project, then returns their current state. */
export async function listProjectRecords(
  projectId: string,
  userId: string,
): Promise<ProjectRecordView[]> {
  const views: ProjectRecordView[] = [];
  for (const def of PROJECT_RECORDS) {
    const pageId = await ensureRecord(projectId, userId, def);
    const [page] = await pgDb
      .select({
        content: ProjectBrainPageTable.compiledTruth,
        updatedAt: ProjectBrainPageTable.updatedAt,
      })
      .from(ProjectBrainPageTable)
      .where(eq(ProjectBrainPageTable.id, pageId))
      .limit(1);
    const [rev] = await pgDb
      .select({ revision: ProjectBrainRevisionTable.revision })
      .from(ProjectBrainRevisionTable)
      .where(eq(ProjectBrainRevisionTable.pageId, pageId))
      .orderBy(desc(ProjectBrainRevisionTable.revision))
      .limit(1);
    views.push({
      slug: def.slug,
      title: def.title,
      purpose: def.purpose,
      content: page?.content ?? def.template,
      revision: rev?.revision ?? 1,
      updatedAt: page?.updatedAt
        ? new Date(page.updatedAt).toISOString()
        : new Date().toISOString(),
      revisionCount: rev?.revision ?? 1,
    });
  }
  return views;
}

/** Saves a record: updates the page and appends a new revision. */
export async function saveProjectRecord(
  projectId: string,
  slug: ProjectRecordSlug,
  content: string,
  changeNote: string | null,
  userId: string,
): Promise<{ revision: number }> {
  const def = PROJECT_RECORDS.find((d) => d.slug === slug);
  if (!def) throw new Error(`Unknown record: ${slug}`);
  const pageId = await ensureRecord(projectId, userId, def);

  const [latest] = await pgDb
    .select({ revision: ProjectBrainRevisionTable.revision })
    .from(ProjectBrainRevisionTable)
    .where(eq(ProjectBrainRevisionTable.pageId, pageId))
    .orderBy(desc(ProjectBrainRevisionTable.revision))
    .limit(1);
  const nextRevision = (latest?.revision ?? 0) + 1;

  await pgDb
    .update(ProjectBrainPageTable)
    .set({ compiledTruth: content, updatedAt: new Date() })
    .where(eq(ProjectBrainPageTable.id, pageId));
  await pgDb.insert(ProjectBrainRevisionTable).values({
    projectId,
    pageId,
    revision: nextRevision,
    content,
    changeNote: changeNote?.trim() ? changeNote.trim() : null,
    userId,
  });
  return { revision: nextRevision };
}

/** Revision history for one record, newest first. */
export async function listRecordRevisions(
  projectId: string,
  slug: ProjectRecordSlug,
): Promise<
  {
    revision: number;
    content: string;
    changeNote: string | null;
    createdAt: string;
  }[]
> {
  const def = PROJECT_RECORDS.find((d) => d.slug === slug);
  if (!def) throw new Error(`Unknown record: ${slug}`);
  const [page] = await pgDb
    .select({ id: ProjectBrainPageTable.id })
    .from(ProjectBrainPageTable)
    .where(
      and(
        eq(ProjectBrainPageTable.projectId, projectId),
        eq(ProjectBrainPageTable.slug, def.slug),
      ),
    )
    .limit(1);
  if (!page) return [];
  const rows = await pgDb
    .select({
      revision: ProjectBrainRevisionTable.revision,
      content: ProjectBrainRevisionTable.content,
      changeNote: ProjectBrainRevisionTable.changeNote,
      createdAt: ProjectBrainRevisionTable.createdAt,
    })
    .from(ProjectBrainRevisionTable)
    .where(eq(ProjectBrainRevisionTable.pageId, page.id))
    .orderBy(desc(ProjectBrainRevisionTable.revision))
    .limit(100);
  return rows.map((r) => ({
    revision: r.revision,
    content: r.content,
    changeNote: r.changeNote,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** Restores an old revision by appending its content as a new revision. */
export async function restoreRecordRevision(
  projectId: string,
  slug: ProjectRecordSlug,
  revision: number,
  userId: string,
): Promise<{ revision: number }> {
  const revisions = await listRecordRevisions(projectId, slug);
  const target = revisions.find((r) => r.revision === revision);
  if (!target) throw new Error(`Revision ${revision} not found`);
  const def = PROJECT_RECORDS.find((d) => d.slug === slug);
  if (!def) throw new Error(`Unknown record: ${slug}`);
  const pageId = await ensureRecord(projectId, userId, def);
  const [latest] = await pgDb
    .select({ revision: ProjectBrainRevisionTable.revision })
    .from(ProjectBrainRevisionTable)
    .where(eq(ProjectBrainRevisionTable.pageId, pageId))
    .orderBy(desc(ProjectBrainRevisionTable.revision))
    .limit(1);
  const nextRevision = (latest?.revision ?? 0) + 1;
  await pgDb
    .update(ProjectBrainPageTable)
    .set({ compiledTruth: target.content, updatedAt: new Date() })
    .where(eq(ProjectBrainPageTable.id, pageId));
  await pgDb.insert(ProjectBrainRevisionTable).values({
    projectId,
    pageId,
    revision: nextRevision,
    content: target.content,
    changeNote: `Restored revision ${revision}`,
    userId,
  });
  return { revision: nextRevision };
}

/** Flattened records for agent context: every record's current content. */
export async function recordsForAgentContext(
  projectId: string,
): Promise<string> {
  const pages = await pgDb
    .select({
      slug: ProjectBrainPageTable.slug,
      title: ProjectBrainPageTable.title,
      content: ProjectBrainPageTable.compiledTruth,
    })
    .from(ProjectBrainPageTable)
    .where(eq(ProjectBrainPageTable.projectId, projectId))
    .orderBy(asc(ProjectBrainPageTable.slug));
  const records = pages.filter((p) => p.slug.startsWith("records/"));
  if (!records.length) return "";
  return records.map((r) => `## ${r.title}\n\n${r.content}`).join("\n\n");
}
