import z from "zod";
import { ChatMentionSchema } from "./chat";
import { VisibilitySchema } from "./util";

export type AgentIcon = {
  type: "emoji";
  value: string;
  style?: Record<string, string>;
};

// Knowledge sources an agent is allowed to search: standalone knowledge bases
// or a project's namespace. Access is re-validated server-side at retrieval
// time — the stored ids are references, not grants.
export const AgentKnowledgeBaseBindingSchema = z.object({
  type: z.enum(["kb", "project"]),
  id: z.string().uuid(),
  /** Display label snapshot for the UI; never trusted server-side. */
  name: z.string().max(200).optional(),
});
export type AgentKnowledgeBaseBinding = z.infer<
  typeof AgentKnowledgeBaseBindingSchema
>;

// Files the agent carries into every sandbox run: a document template, a render
// script, a reference table. Stored as storage keys rather than inline content
// so a large template costs nothing in the system prompt and is never
// regenerated. Ownership of each key is verified server-side on write, and the
// bytes are only ever read from our own storage.
export const AgentFileBindingSchema = z.object({
  /** Object key in the attachments bucket, e.g. "<userId>/template.html". */
  storageKey: z.string().min(1).max(512),
  /** Name the file is staged under in the sandbox working directory. */
  filename: z.string().min(1).max(240),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type AgentFileBinding = z.infer<typeof AgentFileBindingSchema>;

/** Matches MAX_STAGED_FILES; more than this cannot be staged anyway. */
export const MAX_AGENT_FILES = 10;

export const AgentInstructionsSchema = z.object({
  role: z.string().optional(),
  systemPrompt: z.string().optional(),
  mentions: z.array(ChatMentionSchema).optional(),
  knowledgeBases: z.array(AgentKnowledgeBaseBindingSchema).optional(),
  files: z.array(AgentFileBindingSchema).max(MAX_AGENT_FILES).optional(),
});

export const AgentCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(8000).optional(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    userId: z.string(),
    instructions: AgentInstructionsSchema,
    visibility: VisibilitySchema.optional().default("private"),
    // Pinned chat model as "provider/model"; null/absent inherits the chat's
    // selected model / routing default.
    model: z.string().max(120).nullable().optional(),
  })
  .strip();
export const AgentUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(8000).optional(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    instructions: AgentInstructionsSchema.optional(),
    visibility: VisibilitySchema.optional(),
    model: z.string().max(120).nullable().optional(),
  })
  .strip();

export const AgentQuerySchema = z.object({
  type: z.enum(["all", "mine", "shared", "bookmarked"]).default("all"),
  filters: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type AgentVisibility = z.infer<typeof VisibilitySchema>;

export type AgentSummary = {
  id: string;
  name: string;
  description?: string;
  icon?: AgentIcon;
  userId: string;
  visibility: AgentVisibility;
  createdAt: Date;
  updatedAt: Date;
  userName?: string;
  userAvatar?: string;
  isBookmarked?: boolean;
  /** Set when the agent was created from a preset template */
  presetId?: string | null;
  /** Pinned chat model as "provider/model"; null inherits the chat's model */
  model?: string | null;
  /** How many users forked this agent into their own account */
  forkCount?: number | null;
  /** Set when this row is a fork: the source agent it was copied from */
  forkedFromAgentId?: string | null;
  /**
   * Gallery/publishing metadata. A fork snapshots its source here:
   * `{ forkedFrom: { agentId, name, userName } }` — survives the source
   * being deleted or unpublished.
   */
  galleryMetadata?: Record<string, unknown> | null;
  /** When the owner published this agent to the public gallery */
  publishedAt?: Date | string | null;
};

export type Agent = AgentSummary & {
  instructions: z.infer<typeof AgentInstructionsSchema>;
};

/** The `galleryMetadata.forkedFrom` snapshot written at fork time. */
export type AgentForkedFrom = {
  agentId: string;
  name: string;
  userName?: string | null;
};

export function getAgentForkedFrom(
  metadata: Record<string, unknown> | null | undefined,
): AgentForkedFrom | null {
  const candidate = metadata?.forkedFrom;
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as AgentForkedFrom).agentId === "string" &&
    typeof (candidate as AgentForkedFrom).name === "string"
  ) {
    return candidate as AgentForkedFrom;
  }
  return null;
}

export type AgentRepository = {
  insertAgent(
    agent: z.infer<typeof AgentCreateSchema> & {
      organizationId?: string | null;
      /** Fork provenance + gallery snapshot when this row is a fork */
      forkedFromAgentId?: string | null;
      galleryMetadata?: Record<string, unknown> | null;
    },
  ): Promise<Agent>;

  // activeOrganizationId gates the shared (public/readonly) branch: shared
  // agents are only visible when they belong to the caller's active org.
  // Null/undefined => owner-only.
  selectAgentById(
    id: string,
    userId: string,
    activeOrganizationId?: string | null,
  ): Promise<Agent | null>;

  selectAgentsByUserId(userId: string): Promise<Agent[]>;

  // activeOrganizationId scopes the shared-edit branch: a non-owner may only
  // edit a `public` agent that belongs to their active org. Null/undefined =>
  // owner-only (fails closed), matching selectAgentById.
  updateAgent(
    id: string,
    userId: string,
    agent: z.infer<typeof AgentUpdateSchema>,
    activeOrganizationId?: string | null,
  ): Promise<Agent>;

  deleteAgent(id: string, userId: string): Promise<void>;

  selectAgents(
    currentUserId: string,
    filters?: ("all" | "mine" | "shared" | "bookmarked")[],
    limit?: number,
    activeOrganizationId?: string | null,
  ): Promise<AgentSummary[]>;

  checkAccess(
    agentId: string,
    userId: string,
    destructive?: boolean,
    activeOrganizationId?: string | null,
  ): Promise<boolean>;

  /**
   * Counts a fork against its source agent. Fire-and-forget by contract: a
   * counting failure must never fail the fork it counts.
   */
  incrementAgentForkCount(agentId: string): Promise<void>;

  /**
   * Author display names for gallery cards — the published-agent browse
   * queries are owner-free by design, so the gallery pages join names in
   * afterwards.
   */
  getAgentAuthorNames(userIds: string[]): Promise<Map<string, string | null>>;
};

export const AgentGenerateSchema = z.object({
  name: z.string().describe("Agent name"),
  description: z.string().describe("Agent description"),
  instructions: z.string().describe("Agent instructions"),
  role: z.string().describe("Agent role"),
  tools: z
    .array(z.string())
    .describe("Agent allowed tools name")
    .optional()
    .default([]),
});
