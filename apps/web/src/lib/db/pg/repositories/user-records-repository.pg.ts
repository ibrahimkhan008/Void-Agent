import { publishInternalHookEvent } from "@/lib/hooks/internal-events";
import { and, asc, desc, eq } from "drizzle-orm";
import { pgDb } from "../db.pg";
import { ProjectBrainPageTable, ProjectBrainRevisionTable } from "../schema.pg";
import {
  RecordProposalTable,
  UserRecordRevisionTable,
  UserRecordTable,
} from "../schema.pg";
import { PROJECT_RECORDS } from "./project-records-repository.pg";

/**
 * Global (user-level) structured records (master prompt §3.3): the same
 * named-document pattern as the project records, but scoped to the user —
 * persona, behavior, skills, preferences, core memory. The agent reads them
 * as context and PROPOSES changes; the user approves in the memory page
 * (approval flow). Includes per-record retrieval tuning.
 */

export const USER_RECORDS = [
  {
    slug: "memory",
    title: "MEMORY.md",
    purpose: "Core memory: what matters most about the user right now.",
    template:
      "# Memory\n\nThe essentials about the user, kept current.\n\n- \n",
  },
  {
    slug: "persona",
    title: "PERSONA.md",
    purpose: "Who the user is: role, expertise, communication style.",
    template: "# Persona\n\nWho the user is and how they work.\n\n- \n",
  },
  {
    slug: "behavior",
    title: "BEHAVIOR.md",
    purpose: "Observed preferences: how the user likes work done.",
    template:
      "# Behavior\n\nHow the user likes work done, learned over time.\n\n- \n",
  },
  {
    slug: "skills",
    title: "SKILLS.md",
    purpose: "The user's skills, tools, and areas of expertise.",
    template: "# Skills\n\nWhat the user is skilled at and uses.\n\n- \n",
  },
  {
    slug: "preferences",
    title: "PREFERENCES.md",
    purpose: "Concrete preferences: tools, formats, style, workflow.",
    template:
      "# Preferences\n\nConcrete tooling and workflow preferences.\n\n- \n",
  },
] as const;

export type UserRecordSlug = (typeof USER_RECORDS)[number]["slug"];

export interface UserRecordView {
  slug: string;
  title: string;
  purpose: string;
  content: string;
  revision: number;
  includeInContext: boolean;
  updatedAt: string;
}

/** Ensures the five global records exist for the user, then returns them. */
export async function listUserRecords(
  userId: string,
): Promise<UserRecordView[]> {
  const views: UserRecordView[] = [];
  for (const def of USER_RECORDS) {
    let [page] = await pgDb
      .select()
      .from(UserRecordTable)
      .where(
        and(
          eq(UserRecordTable.userId, userId),
          eq(UserRecordTable.slug, def.slug),
        ),
      )
      .limit(1);

    if (!page) {
      const inserted = await pgDb
        .insert(UserRecordTable)
        .values({
          userId,
          slug: def.slug,
          title: def.title,
          content: def.template,
        })
        .returning();
      page = inserted[0];
      await pgDb.insert(UserRecordRevisionTable).values({
        recordId: page.id,
        revision: 1,
        content: def.template,
        changeNote: "Record created",
        userId,
      });
    }

    const [rev] = await pgDb
      .select({ revision: UserRecordRevisionTable.revision })
      .from(UserRecordRevisionTable)
      .where(eq(UserRecordRevisionTable.recordId, page.id))
      .orderBy(desc(UserRecordRevisionTable.revision))
      .limit(1);

    views.push({
      slug: page.slug,
      title: page.title,
      purpose: def.purpose,
      content: page.content,
      revision: rev?.revision ?? 1,
      includeInContext: page.includeInContext,
      updatedAt: new Date(page.updatedAt).toISOString(),
    });
  }
  return views;
}

/** Saves a global record: updates content + appends a revision. */
export async function saveUserRecord(
  userId: string,
  slug: UserRecordSlug,
  content: string,
  changeNote: string | null,
): Promise<{ revision: number }> {
  let [page] = await pgDb
    .select()
    .from(UserRecordTable)
    .where(
      and(eq(UserRecordTable.userId, userId), eq(UserRecordTable.slug, slug)),
    )
    .limit(1);

  if (!page) {
    const def = USER_RECORDS.find((d) => d.slug === slug);
    const inserted = await pgDb
      .insert(UserRecordTable)
      .values({ userId, slug, title: def?.title ?? slug, content })
      .returning();
    page = inserted[0];
    await pgDb.insert(UserRecordRevisionTable).values({
      recordId: page.id,
      revision: 1,
      content,
      changeNote: changeNote ?? "Record created",
      userId,
    });
    await publishInternalHookEvent({
      userId,
      eventType: "memory.record.updated",
      sourceId: `${slug}:1`,
      text: `User memory record ${slug} changed (revision 1).`,
      meta: { slug, revision: 1, scope: "global" },
    }).catch((error) =>
      console.error("[hooks] memory.record.updated enqueue failed", error),
    );
    return { revision: 1 };
  }

  const [latest] = await pgDb
    .select({ revision: UserRecordRevisionTable.revision })
    .from(UserRecordRevisionTable)
    .where(eq(UserRecordRevisionTable.recordId, page.id))
    .orderBy(desc(UserRecordRevisionTable.revision))
    .limit(1);
  const nextRevision = (latest?.revision ?? 0) + 1;

  await pgDb
    .update(UserRecordTable)
    .set({ content, updatedAt: new Date() })
    .where(eq(UserRecordTable.id, page.id));
  await pgDb.insert(UserRecordRevisionTable).values({
    recordId: page.id,
    revision: nextRevision,
    content,
    changeNote: changeNote?.trim() ? changeNote.trim() : null,
    userId,
  });
  await publishInternalHookEvent({
    userId,
    eventType: "memory.record.updated",
    sourceId: `${slug}:${nextRevision}`,
    text: `User memory record ${slug} changed (revision ${nextRevision}).`,
    meta: { slug, revision: nextRevision, scope: "global" },
  }).catch((error) =>
    console.error("[hooks] memory.record.updated enqueue failed", error),
  );
  return { revision: nextRevision };
}

export async function listUserRecordRevisions(
  userId: string,
  slug: UserRecordSlug,
) {
  const [page] = await pgDb
    .select()
    .from(UserRecordTable)
    .where(
      and(eq(UserRecordTable.userId, userId), eq(UserRecordTable.slug, slug)),
    )
    .limit(1);
  if (!page) return [];
  const rows = await pgDb
    .select({
      revision: UserRecordRevisionTable.revision,
      content: UserRecordRevisionTable.content,
      changeNote: UserRecordRevisionTable.changeNote,
      createdAt: UserRecordRevisionTable.createdAt,
    })
    .from(UserRecordRevisionTable)
    .where(eq(UserRecordRevisionTable.recordId, page.id))
    .orderBy(desc(UserRecordRevisionTable.revision))
    .limit(100);
  return rows.map((r) => ({
    revision: r.revision,
    content: r.content,
    changeNote: r.changeNote,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** Per-record retrieval tuning (global records). */
export async function setUserRecordContext(
  userId: string,
  slug: UserRecordSlug,
  includeInContext: boolean,
): Promise<void> {
  await pgDb
    .update(UserRecordTable)
    .set({ includeInContext, updatedAt: new Date() })
    .where(
      and(eq(UserRecordTable.userId, userId), eq(UserRecordTable.slug, slug)),
    );
}

/** Approved global records flattened for agent context assembly. */
export async function userRecordsForAgentContext(
  userId: string,
): Promise<string> {
  const pages = await pgDb
    .select({
      title: UserRecordTable.title,
      content: UserRecordTable.content,
    })
    .from(UserRecordTable)
    .where(
      and(
        eq(UserRecordTable.userId, userId),
        eq(UserRecordTable.includeInContext, true),
      ),
    )
    .orderBy(asc(UserRecordTable.slug));
  return pages.map((r) => `## ${r.title}\n\n${r.content}`).join("\n\n");
}

/**
 * The agent proposes a record change. Global-scope proposals are created on
 * the user_record table directly as PENDING content? No — proposals live in
 * record_proposal only; approval applies them through saveUserRecord.
 */
export async function proposeRecordChange(input: {
  userId: string;
  scope: "global" | "project";
  projectId?: string | null;
  slug: string;
  title: string;
  content: string;
  changeNote?: string;
  proposedBy?: string;
}): Promise<{ id: string }> {
  const inserted = await pgDb
    .insert(RecordProposalTable)
    .values({
      userId: input.userId,
      projectId: input.scope === "project" ? (input.projectId ?? null) : null,
      scope: input.scope,
      slug: input.slug,
      title: input.title,
      proposedContent: input.content,
      changeNote: input.changeNote ?? null,
      status: "pending",
      proposedBy: input.proposedBy ?? "agent",
    })
    .returning({ id: RecordProposalTable.id });
  return { id: inserted[0].id };
}

/** Pending proposals for a user (global + projects they own). */
export async function listPendingProposals(userId: string) {
  const rows = await pgDb
    .select()
    .from(RecordProposalTable)
    .where(
      and(
        eq(RecordProposalTable.userId, userId),
        eq(RecordProposalTable.status, "pending"),
      ),
    )
    .orderBy(desc(RecordProposalTable.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    projectId: r.projectId,
    slug: r.slug,
    title: r.title,
    proposedContent: r.proposedContent,
    changeNote: r.changeNote,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/**
 * Applies an approved proposal: project scope saves through the project
 * record path (revision history), global scope through saveUserRecord.
 */
export async function applyProposal(
  proposalId: string,
  resolvedByUserId: string,
): Promise<{ applied: boolean; slug: string; scope: string }> {
  const [proposal] = await pgDb
    .select()
    .from(RecordProposalTable)
    .where(eq(RecordProposalTable.id, proposalId))
    .limit(1);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") {
    throw new Error("Proposal already resolved");
  }

  if (proposal.scope === "project" && proposal.projectId) {
    const def = PROJECT_RECORDS.find((d) => d.slug === proposal.slug);
    const [page] = await pgDb
      .select({ id: ProjectBrainPageTable.id })
      .from(ProjectBrainPageTable)
      .where(
        and(
          eq(ProjectBrainPageTable.projectId, proposal.projectId),
          eq(ProjectBrainPageTable.slug, def?.slug ?? proposal.slug),
        ),
      )
      .limit(1);
    if (!page) throw new Error("Project record not found for this slug");
    const [latest] = await pgDb
      .select({ revision: ProjectBrainRevisionTable.revision })
      .from(ProjectBrainRevisionTable)
      .where(eq(ProjectBrainRevisionTable.pageId, page.id))
      .orderBy(desc(ProjectBrainRevisionTable.revision))
      .limit(1);
    const nextRevision = (latest?.revision ?? 0) + 1;
    await pgDb
      .update(ProjectBrainPageTable)
      .set({ compiledTruth: proposal.proposedContent, updatedAt: new Date() })
      .where(eq(ProjectBrainPageTable.id, page.id));
    await pgDb.insert(ProjectBrainRevisionTable).values({
      projectId: proposal.projectId,
      pageId: page.id,
      revision: nextRevision,
      content: proposal.proposedContent,
      changeNote: proposal.changeNote ?? "Applied from approved proposal",
      userId: resolvedByUserId,
    });
    await publishInternalHookEvent({
      userId: resolvedByUserId,
      eventType: "memory.record.updated",
      sourceId: `${proposal.projectId}:${proposal.slug}:${nextRevision}`,
      text: `Project memory record ${proposal.slug} changed (revision ${nextRevision}).`,
      meta: {
        scope: "project",
        projectId: proposal.projectId,
        slug: proposal.slug,
        revision: nextRevision,
      },
    }).catch((error) =>
      console.error("[hooks] memory.record.updated enqueue failed", error),
    );
  } else {
    await saveUserRecord(
      proposal.userId,
      proposal.slug as UserRecordSlug,
      proposal.proposedContent,
      proposal.changeNote ?? "Applied from approved proposal",
    );
  }

  await pgDb
    .update(RecordProposalTable)
    .set({
      status: "approved",
      resolvedByUserId,
      resolvedAt: new Date(),
    })
    .where(eq(RecordProposalTable.id, proposalId));
  return {
    applied: true,
    slug: proposal.slug,
    scope: proposal.scope,
  };
}

/** Rejects a proposal (audit trail kept). */
export async function rejectProposal(
  proposalId: string,
  resolvedByUserId: string,
): Promise<void> {
  await pgDb
    .update(RecordProposalTable)
    .set({ status: "rejected", resolvedByUserId, resolvedAt: new Date() })
    .where(eq(RecordProposalTable.id, proposalId));
}
