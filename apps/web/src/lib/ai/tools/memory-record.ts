import { PROJECT_RECORDS } from "@/lib/db/pg/repositories/project-records-repository.pg";
import { proposeRecordChange } from "@/lib/db/pg/repositories/user-records-repository.pg";
import { tool as createTool, jsonSchema } from "ai";

/**
 * Void Memory — agent record proposals (master prompt §3.3): when the agent
 * decides something belongs in memory, it creates or updates a structured
 * record. Agent-initiated changes go through the approval flow: the proposal
 * lands in the user's memory page as PENDING and only applies once approved.
 * User-made edits in the memory page apply directly.
 */

const GLOBAL_SLUGS = [
  "memory",
  "persona",
  "behavior",
  "skills",
  "preferences",
] as const;

const PROJECT_SLUGS: string[] = PROJECT_RECORDS.map((r) => r.slug);

export const MemoryRecordToolName = "propose-record";

interface MemoryRecordInput {
  scope: "global" | "project";
  slug: string;
  title?: string;
  content: string;
  changeNote?: string;
}

interface MemoryRecordOutput {
  proposed: boolean;
  proposalId?: string;
  message?: string;
  error?: string;
}

export const createMemoryRecordTool = (
  userId: string,
  projectId?: string | null,
) => {
  const scopeHint = projectId
    ? "Project scope writes to the project's own records (MEMORY.md, TODO.md, DONT.md, BOUNDARIES.md, RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md, DEPLOYMENT.md). Global scope writes to the user-level records (MEMORY.md, PERSONA.md, BEHAVIOR.md, SKILLS.md, PREFERENCES.md) that apply across all projects."
    : "Global scope writes to the user-level records (MEMORY.md, PERSONA.md, BEHAVIOR.md, SKILLS.md, PREFERENCES.md) that apply across all projects.";

  return createTool<
    MemoryRecordInput,
    MemoryRecordOutput,
    Record<string, unknown>
  >({
    description: `Propose creating or updating a structured memory record about the user or the project. Use this when you learn something durable worth remembering: the user's persona, working behavior, skills, preferences, project rules, decisions, or deployment details. ${scopeHint} The proposal takes effect once the user approves it in their Void Memory page — do not re-propose the same change.`,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["global", "project"],
          description:
            "global = about the user, applies across projects. project = about the current project. Required.",
        },
        slug: {
          type: "string",
          description:
            "The record to write. Project scope: memory | todo | dont | rules | style | architecture | decisions | security | deployment. Global scope: memory | persona | behavior | skills | preferences. Required.",
        },
        title: {
          type: "string",
          description:
            "Record title when creating a NEW record. Required for new records.",
        },
        content: {
          type: "string",
          description:
            "The FULL new content of the record in Markdown — include everything the record should say after this change, not just a delta. Required.",
        },
        changeNote: {
          type: "string",
          description: "Short summary of what changed and why.",
        },
      },
      required: ["scope", "slug", "content"],
    }),
    execute: async ({ scope, slug, title, content, changeNote }) => {
      // Scope validation
      if (scope === "project" && !projectId) {
        return {
          proposed: false,
          error:
            "Project-scope records need an active project — this conversation has none.",
        };
      }

      // Known-slug validation per scope
      const known =
        scope === "project"
          ? PROJECT_SLUGS.includes(slug)
          : (GLOBAL_SLUGS as readonly string[]).includes(slug);
      if (!known) {
        return {
          proposed: false,
          error: `Unknown ${scope} record slug: ${slug}`,
        };
      }

      const proposal = await proposeRecordChange({
        userId,
        scope,
        projectId: projectId ?? null,
        slug,
        title: title ?? slug,
        content,
        changeNote,
        proposedBy: "agent",
      });

      return {
        proposed: true,
        proposalId: proposal.id,
        message:
          "Proposal saved. It takes effect once the user approves it in their Void Memory page.",
      };
    },
  });
};
