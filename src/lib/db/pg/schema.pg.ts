import { TipTapMentionJsonContent } from "@/types/util";
import { UIMessage } from "ai";
import { Agent } from "app-types/agent";
import { ChatMetadata } from "app-types/chat";
import { MCPServerConfig } from "app-types/mcp";
import {
  DEFAULT_SUBSCRIPTION_TIER,
  SUBSCRIPTION_TIER_VALUES,
  type SubscriptionTierName,
} from "app-types/subscription";
import { UserPreferences } from "app-types/user";
import { DBEdge, DBNode, DBWorkflow } from "app-types/workflow";
import { sql } from "drizzle-orm";
import { isNotNull, isNull } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import type {
  ProblemReportContext,
  ProblemReportScreenshot,
} from "../../../types/problem-report";

export const ChatThreadTable = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // P4.0 — #19 team seats. NULL = personal scope; non-null = team
  // scope. The scopedWhere helper in P4.A treats NULL as user-owned
  // and non-null as team-owned (and additionally checks team_member
  // for the calling user).
  orgId: uuid("org_id"),
  projectId: uuid("project_id").references(() => ProjectTable.id, {
    onDelete: "set null",
  }),
  // Phase 1+#7 — thread branching. A thread is either a root
  // (parentThreadId null) or a fork of another thread, with the assistant
  // message the user forked from preserved for navigation.
  parentThreadId: uuid("parent_thread_id").references(
    () => ChatThreadTable.id,
    { onDelete: "set null" },
  ),
  forkFromMessageId: text("fork_from_message_id").references(
    () => ChatMessageTable.id,
    { onDelete: "set null" },
  ),
  branchLabel: varchar("branch_label", { length: 100 }),
  // P2.4 — thread insights. Generated lazily by a background pass that
  // summarises the conversation and extracts a list of decisions and
  // action items. `insightsGeneratedAt` lets the UI know whether the
  // current insights are stale (older than the latest message).
  summary: text("summary"),
  decisions: jsonb("decisions").$type<Array<{ text: string; at: string }>>(),
  actionItems:
    jsonb("action_items").$type<Array<{ text: string; done: boolean }>>(),
  // null keeps the legacy behavior of searching all of the user's knowledge
  // collections; an explicit array scopes retrieval to this conversation.
  collectionIds: uuid("collection_ids").array(),
  insightsGeneratedAt: timestamp("insights_generated_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ChatMessageTable = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
  // P4.0 — #19 team seats. Denormalized from chat_thread.org_id so
  // scoped list queries don't need to JOIN. Kept in sync by
  // chatRepository on insert / fork. NULL = personal scope.
  orgId: uuid("org_id"),
  role: text("role").notNull().$type<UIMessage["role"]>(),
  parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AgentTable = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  // P4.0 — #15 Agent gallery. `published_at` is the wall-clock time the
  // agent was first published; NULL = draft. `install_count` is
  // denormalized cache; the source of truth is `agent_install`.
  // `gallery_metadata` is a free-form jsonb (e.g. tags, hero copy,
  // screenshots); `cover_image_url` is a CDN URL.
  publishedAt: timestamp("published_at"),
  installCount: integer("install_count").notNull().default(0),
  galleryMetadata: jsonb("gallery_metadata").$type<Record<string, unknown>>(),
  coverImageUrl: text("cover_image_url"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Private replay records for explicit agent-creation approvals. Kept separate
// from AgentTable so request keys and prompt hashes never appear in agent API
// projections. The write and this reservation are committed atomically.
export const AgentApprovalRequestTable = pgTable(
  "agent_approval_request",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    requestHash: text("request_hash").notNull(),
    agentId: uuid("agent_id").references(() => AgentTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("agent_approval_request_user_key_unique").on(
      table.userId,
      table.requestKey,
    ),
    index("agent_approval_request_created_at_idx").on(table.createdAt),
  ],
);

export const BookmarkTable = pgTable(
  "bookmark",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // P4.0 — #19 team seats. NULL = personal scope; non-null = team
    // scope. The scopedWhere helper in P4.A treats NULL as user-owned
    // and non-null as team-owned.
    orgId: uuid("org_id"),
    itemId: uuid("item_id").notNull(),
    itemType: varchar("item_type", {
      // P1.9 — bookmark is now polymorphic across chat threads too, not
      // just agents/workflows/MCP servers. The unique index on
      // (userId, itemId, itemType) still prevents duplicate bookmarks.
      enum: ["agent", "workflow", "mcp", "thread"],
    }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.itemId, table.itemType),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_item_idx").on(table.itemId, table.itemType),
  ],
);

export const McpServerTable = pgTable("mcp_server", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  config: json("config").notNull().$type<MCPServerConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", {
    enum: ["public", "private"],
  })
    .notNull()
    .default("private"),
  // P4.0 — #14 MCP marketplace. `curated` is the editor's pick flag
  // (top of the marketplace page). `category` is a free-form varchar
  // (e.g. "search", "productivity"). `install_count` is a denormalized
  // cache; the source of truth is `mcp_server_install`. `description`
  // and `homepage_url` are display-only metadata.
  curated: boolean("curated").notNull().default(false),
  category: varchar("category", { length: 64 }),
  installCount: integer("install_count").notNull().default(0),
  description: text("description"),
  homepageUrl: text("homepage_url"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserTable = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  role: text("role").notNull().default("user"),
  tier: varchar("tier", { enum: SUBSCRIPTION_TIER_VALUES })
    .notNull()
    .default(DEFAULT_SUBSCRIPTION_TIER),
  createdIp: text("created_ip"),
  lastIp: text("last_ip"),
});

export const N8nUserTable = pgTable("n8n_user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  n8nUserId: text("n8n_user_id").notNull(),
  apiKey: text("api_key").notNull(),
  email: text("email"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Role tables removed - using Better Auth's built-in role system
// Roles are now managed via the 'role' field on UserTable

export const SessionTable = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // Admin plugin field (from better-auth generated schema)
  impersonatedBy: text("impersonated_by"),
});

export const AccountTable = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const VerificationTable = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

// Tool customization table for per-user additional instructions
export const McpToolCustomizationTable = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationTable = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

export const WorkflowTable = pgTable("workflow", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  name: text("name").notNull(),
  icon: json("icon").$type<DBWorkflow["icon"]>(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // P4.0 — #19 team seats. NULL = personal scope; non-null = team
  // scope. See chat_thread.orgId for the same rationale.
  orgId: uuid("org_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const WorkflowNodeDataTable = pgTable(
  "workflow_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    version: text("version").notNull().default("0.1.0"),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => WorkflowTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    uiConfig: json("ui_config").$type<DBNode["uiConfig"]>().default({}),
    nodeConfig: json("node_config")
      .$type<Partial<DBNode["nodeConfig"]>>()
      .default({}),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("workflow_node_kind_idx").on(t.kind)],
);

export const WorkflowEdgeTable = pgTable("workflow_edge", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => WorkflowTable.id, { onDelete: "cascade" }),
  source: uuid("source")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  target: uuid("target")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  uiConfig: json("ui_config").$type<DBEdge["uiConfig"]>().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveTable = pgTable("archive", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveItemTable = pgTable(
  "archive_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => ArchiveTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("archive_item_item_id_idx").on(t.itemId)],
);

export const McpOAuthSessionTable = pgTable(
  "mcp_oauth_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    clientInfo: json("client_info"),
    tokens: json("tokens"),
    codeVerifier: text("code_verifier"),
    state: text("state").unique(), // OAuth state parameter for current flow (unique for security)
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("mcp_oauth_session_server_id_idx").on(t.mcpServerId),
    index("mcp_oauth_session_state_idx").on(t.state),
    // Partial index for sessions with tokens for better performance
    index("mcp_oauth_session_tokens_idx")
      .on(t.mcpServerId)
      .where(isNotNull(t.tokens)),
  ],
);

export type McpServerEntity = typeof McpServerTable.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadTable.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageTable.$inferSelect;

export type AgentEntity = typeof AgentTable.$inferSelect;
export type UserEntity = typeof UserTable.$inferSelect;
export type SessionEntity = typeof SessionTable.$inferSelect;

export type ToolCustomizationEntity =
  typeof McpToolCustomizationTable.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationTable.$inferSelect;

export const ChatExportTable = pgTable("chat_export", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  exporterId: uuid("exporter_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  originalThreadId: uuid("original_thread_id"),
  messages: json("messages").notNull().$type<
    Array<{
      id: string;
      role: UIMessage["role"];
      parts: UIMessage["parts"];
      metadata?: ChatMetadata;
    }>
  >(),
  exportedAt: timestamp("exported_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
});

export const ChatExportCommentTable = pgTable("chat_export_comment", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  exportId: uuid("export_id")
    .notNull()
    .references(() => ChatExportTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => ChatExportCommentTable.id, {
    onDelete: "cascade",
  }),
  content: json("content").notNull().$type<TipTapMentionJsonContent>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const CanvasExportTable = pgTable(
  "canvas_export",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    exporterId: uuid("exporter_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    canvasId: text("canvas_id").notNull(),
    title: text("title").notNull(),
    html: text("html").notNull(),
    scene: json("scene").$type<{
      elements?: unknown[];
      files?: Record<string, unknown>;
    }>(),
    metadata: json("metadata").$type<{
      modelId?: string;
      modelLabel?: string;
      providerName?: string;
      usage?: {
        input_tokens?: number | string;
        output_tokens?: number | string;
      };
      generatedAt?: string;
      canvasVersion?: number;
      iteration?: number;
    }>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [
    index("canvas_export_exporter_created_idx").on(t.exporterId, t.createdAt),
    index("canvas_export_active_idx")
      .on(t.id)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// Public page snapshots use an unguessable slug as a bearer capability. Each
// publish appends a version so the URL remains stable; revoking the slug takes
// every version offline.
export const PublishedPageTable = pgTable(
  "published_page",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    html: text("html").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    threadId: uuid("thread_id"),
    publishedAt: timestamp("published_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    unique("published_page_slug_version_unique").on(table.slug, table.version),
    index("published_page_slug_idx").on(table.slug),
    index("published_page_owner_idx").on(table.ownerId),
  ],
);

export type ArchiveEntity = typeof ArchiveTable.$inferSelect;
export type ArchiveItemEntity = typeof ArchiveItemTable.$inferSelect;
export type BookmarkEntity = typeof BookmarkTable.$inferSelect;

// User Connectors table for storing OAuth connections to external services (Gmail, etc.)
export const UserConnectorTable = pgTable(
  "user_connector",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", {
      enum: [
        "gmail",
        "google-drive",
        "google-calendar",
        "google-docs",
        "google-forms",
        "google-keep",
        "google-meet",
        "google-sheets",
        "google-slides",
        "google-tasks",
        "youtube",
        "outlook",
        "slack",
        "notion",
        "github",
        // 42 new providers added in 0029 — see
        // `src/lib/connectors/providers-list.ts` for the canonical list.
        // Atlassian
        "confluence",
        "jira",
        // Issue trackers
        "linear",
        "asana",
        "clickup",
        "productboard",
        "testrail",
        // Docs / wikis
        "coda",
        "outline",
        "slab",
        "guru",
        "highspot",
        "document360",
        // Code / VCS
        "gitlab",
        "bitbucket",
        // Storage
        "dropbox",
        // CRM / support
        "zendesk",
        "freshdesk",
        "salesforce",
        "hubspot",
        "airtable",
        // Sales enablement
        "gong",
        "egnyte",
        // Microsoft Graph (reuses Microsoft tenant)
        "teams",
        // Communication
        "discord",
        // Token-only (server-side env-var)
        "bookstack",
        "gitbook",
        "canvas",
        "loopio",
        "discourse",
        "xenforo",
        "drupal-wiki",
        "axero",
        "zulip",
        "mediawiki",
        "fireflies",
        "wikipedia",
      ],
    }).notNull(),
    email: text("email"), // The email/account connected
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    scope: text("scope"),
    isConnected: boolean("is_connected").notNull().default(false),
    isPaused: boolean("is_paused").notNull().default(false),
    lastSyncAt: timestamp("last_sync_at"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.provider),
    index("user_connector_user_id_idx").on(table.userId),
    index("user_connector_provider_idx").on(table.provider),
  ],
);

export type UserConnectorEntity = typeof UserConnectorTable.$inferSelect;

export const MemoryTable = pgTable(
  "user_memory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // P4.0 — #19 team seats. NULL = personal scope; non-null = team
    // scope. Team memories are surfaced to all members of the team.
    orgId: uuid("org_id"),
    content: text("content").notNull(),
    category: varchar("category", { length: 100 }),
    // Phase 1+#1 — vector semantic search. `embedding` is nullable so we
    // can backfill the column for existing rows in P1.6. The HNSW index is
    // created out-of-band in the migration because Drizzle's `index()`
    // builder does not support USING hnsw.
    embedding: vector("embedding", { dimensions: 768 }),
    // Scope: which conversations should this memory surface in?
    //   - "user"  (default): all threads
    //   - "agent": only when a specific agent is active
    //   - "thread": only in a specific thread
    scope: varchar("scope", { length: 16 }).notNull().default("user"),
    scopeId: uuid("scope_id"),
    // Link back to the chat message the memory was extracted from.
    sourceMessageId: text("source_message_id").references(
      () => ChatMessageTable.id,
      { onDelete: "set null" },
    ),
    // Extraction confidence from the LLM pass (0..1). Low-confidence rows
    // are hidden from the prompt by default.
    confidence: real("confidence"),
    // Pinned memories always surface in the prompt, regardless of score.
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_memory_user_id_idx").on(table.userId),
    index("user_memory_user_scope_idx").on(table.userId, table.scope),
    index("user_memory_source_message_idx").on(table.sourceMessageId),
  ],
);

export type MemoryEntity = typeof MemoryTable.$inferSelect;

// Security event log — stores request metadata for logins, signups, and sensitive actions
export const SecurityEventTable = pgTable(
  "security_event",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", {
      enum: [
        "login",
        "signup",
        "password_change",
        "api_key_create",
        "account_update",
      ],
    }).notNull(),
    ip: text("ip").notNull(),
    country: text("country"),
    city: text("city"),
    device: text("device").notNull(),
    os: text("os").notNull(),
    browser: text("browser").notNull(),
    userAgent: text("user_agent").notNull(),
    referer: text("referer"),
    isNewDevice: boolean("is_new_device").notNull().default(false),
    isNewLocation: boolean("is_new_location").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("security_event_user_id_idx").on(table.userId),
    index("security_event_type_idx").on(table.eventType),
    index("security_event_created_at_idx").on(table.createdAt),
  ],
);

export type SecurityEventEntity = typeof SecurityEventTable.$inferSelect;

export const SiteConfigTable = pgTable("site_config", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  key: text("key").notNull().unique(), // models | tools | canvas | artifacts | general
  settings: json("settings").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type SiteConfigEntity = typeof SiteConfigTable.$inferSelect;

export const SiteConfigAuditTable = pgTable(
  "site_config_audit",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    key: text("key").notNull(), // models | tools | canvas | artifacts | general
    settings: json("settings").notNull().$type<Record<string, unknown>>(),
    changedBy: uuid("changed_by").notNull(),
    changedAt: timestamp("changed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    changeType: text("change_type")
      .notNull()
      .$type<"create" | "update" | "reset">(),
  },
  (table) => [index("site_config_audit_key_idx").on(table.key)],
);

export type SiteConfigAuditEntity = typeof SiteConfigAuditTable.$inferSelect;

// =====================================================================
// Dodo Payments integration
// =====================================================================
//
// `dodo_subscription` is the source of truth for the user <-> paid plan
// link. `user.tier` is kept in sync as a denormalized cache so that
// rate-limit checks (`isFreeTier`, `getUserDetails`) stay O(1).
//
// `dodo_payment` records every one-off or recurring payment that Dodo
// tells us about through the webhook stream. We keep an audit trail
// even for active subscriptions.
//
// `dodo_webhook_event` is the idempotency table: keyed by the
// `webhook-id` header so a redelivered event never re-applies state.
// =====================================================================

export const DODO_SUBSCRIPTION_STATUSES = [
  "pending",
  "active",
  "on_hold",
  "cancelled",
  "failed",
  "expired",
] as const;
export type DodoSubscriptionStatus =
  (typeof DODO_SUBSCRIPTION_STATUSES)[number];

export const DodoSubscriptionTable = pgTable(
  "dodo_subscription",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    dodoSubscriptionId: text("dodo_subscription_id").notNull().unique(),
    dodoCustomerId: text("dodo_customer_id"),
    dodoProductId: text("dodo_product_id").notNull(),
    tier: varchar("tier", { enum: SUBSCRIPTION_TIER_VALUES })
      .notNull()
      .default(DEFAULT_SUBSCRIPTION_TIER),
    status: varchar("status", { enum: DODO_SUBSCRIPTION_STATUSES })
      .notNull()
      .default("pending"),
    // Column names mirror the Dodo API response shape:
    //   previous_billing_date / next_billing_date / cancel_at_next_billing_date.
    // See migration 0030_rename_dodo_billing_columns.sql.
    previousBillingDate: timestamp("previous_billing_date"),
    nextBillingDate: timestamp("next_billing_date"),
    cancelAtNextBillingDate: boolean("cancel_at_next_billing_date")
      .notNull()
      .default(false),
    cancelledAt: timestamp("cancelled_at"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("dodo_subscription_user_id_idx").on(table.userId),
    index("dodo_subscription_status_idx").on(table.status),
  ],
);

export type DodoSubscriptionEntity = typeof DodoSubscriptionTable.$inferSelect;

export const DodoPaymentTable = pgTable(
  "dodo_payment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    dodoPaymentId: text("dodo_payment_id").notNull().unique(),
    dodoSubscriptionId: text("dodo_subscription_id"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    tier: varchar("tier", { enum: SUBSCRIPTION_TIER_VALUES }).notNull(),
    paidAt: timestamp("paid_at"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("dodo_payment_user_id_idx").on(table.userId),
    index("dodo_payment_subscription_id_idx").on(table.dodoSubscriptionId),
  ],
);

export type DodoPaymentEntity = typeof DodoPaymentTable.$inferSelect;

export const DodoWebhookEventTable = pgTable("dodo_webhook_event", {
  // webhook-id is the natural primary key and acts as the dedupe
  // boundary — Dodo can redeliver the same event multiple times and we
  // must not re-apply it.
  webhookId: text("webhook_id").primaryKey().notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  payload: json("payload").notNull().$type<Record<string, unknown>>(),
  receivedAt: timestamp("received_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  processedAt: timestamp("processed_at"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});

export type DodoWebhookEventEntity = typeof DodoWebhookEventTable.$inferSelect;

// ---------------------------------------------------------------------------
// Bug Bounty Program
// ---------------------------------------------------------------------------
// `BugReportTable` is the user-submitted report. Reports are owned by a user
// and triaged by an admin. Severity is the reporter's self-assessment and
// `awardedAmountCents` is filled in by the admin when status moves to
// `awarded` — payout is handled out of band.
export const BUG_REPORT_STATUSES = [
  "pending",
  "triaging",
  "accepted",
  "duplicate",
  "rejected",
  "awarded",
] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const BUG_REPORT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type BugReportSeverity = (typeof BUG_REPORT_SEVERITIES)[number];

export const BugReportTable = pgTable(
  "bug_report",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: varchar("severity", {
      enum: BUG_REPORT_SEVERITIES,
    })
      .notNull()
      .default("medium"),
    category: varchar("category", { length: 64 }).notNull().default("other"),
    affectedArea: text("affected_area"), // free-form area, e.g. "Chat streaming"
    reproductionSteps: text("reproduction_steps").notNull().default(""),
    impact: text("impact").notNull().default(""),
    proofOfConcept: text("proof_of_concept"), // optional PoC / link
    status: varchar("status", { enum: BUG_REPORT_STATUSES })
      .notNull()
      .default("pending"),
    // Admin-set bounty. Cents-based to avoid float drift.
    awardedAmountCents: integer("awarded_amount_cents"),
    awardedCurrency: varchar("awarded_currency", { length: 8 })
      .notNull()
      .default("USD"),
    awardedAt: timestamp("awarded_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bug_report_user_id_idx").on(table.userId),
    index("bug_report_status_idx").on(table.status),
    index("bug_report_created_at_idx").on(table.createdAt),
    index("bug_report_severity_idx").on(table.severity),
  ],
);

export type BugReportEntity = typeof BugReportTable.$inferSelect;

// Comments on a report. `isInternal` flags admin-only notes that should not
// be visible to the reporter.
export const BugReportCommentTable = pgTable(
  "bug_report_comment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => BugReportTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bug_report_comment_report_id_idx").on(table.reportId),
    index("bug_report_comment_user_id_idx").on(table.userId),
  ],
);

export type BugReportCommentEntity = typeof BugReportCommentTable.$inferSelect;

// ---------------------------------------------------------------------------
// P2.1 — File Collections (RAG-lite)
// ---------------------------------------------------------------------------
// A `collection` is a user-owned grouping of items. An `item` is either a
// previously-uploaded file (referenced by URL) or a source URL the user
// points us at. Each item is chunked into `document` rows (one per logical
// file / page) and each document is sliced into `document_chunk` rows with
// a 768-dim embedding. The HNSW index on `document_chunk.embedding` is
// created in the migration (Drizzle's `index()` builder does not support
// `USING hnsw`).

export const COLLECTION_ITEM_STATUSES = [
  "pending",
  "chunking",
  "ready",
  "failed",
] as const;
export type CollectionItemStatus = (typeof COLLECTION_ITEM_STATUSES)[number];

export const COLLECTION_SOURCE_TYPES = [
  "file",
  "source-url",
  "mcp-sync",
  "composio-sync",
] as const;
export type CollectionSourceType = (typeof COLLECTION_SOURCE_TYPES)[number];

export const CollectionTable = pgTable(
  "collection",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // P4.0 — #19 team seats. NULL = personal scope; non-null = team
    // scope. See chat_thread.orgId for the same rationale.
    orgId: uuid("org_id"),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("collection_user_id_idx").on(table.userId),
    index("collection_org_id_idx").on(table.orgId),
  ],
);

export const CollectionItemTable = pgTable(
  "collection_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => CollectionTable.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", {
      enum: COLLECTION_SOURCE_TYPES,
    }).notNull(),
    // URL to the underlying blob (Vercel Blob / S3) for uploaded files,
    // or the canonical source URL for `source-url` items.
    sourceUrl: text("source_url"),
    // Opaque private storage key for the original bytes; never a public URL.
    storageKey: text("storage_key"),
    filename: text("filename"),
    mediaType: text("media_type"),
    status: varchar("status", { enum: COLLECTION_ITEM_STATUSES })
      .notNull()
      .default("pending"),
    // Populated when status moves to "failed" so the UI can show why.
    error: text("error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("collection_item_collection_id_idx").on(table.collectionId),
    index("collection_item_status_idx").on(table.status),
  ],
);

// A `document` is one logical file or page. For most files there is a
// 1:1 with `collection_item`; for paginated sources (PDFs, scraped pages)
// a single item can produce many documents.
export const DocumentTable = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    collectionItemId: uuid("collection_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    // Full extracted text. Held in `text` (no length cap) so we can
    // re-chunk without re-fetching the source.
    content: text("content"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("document_collection_item_id_idx").on(table.collectionItemId),
  ],
);

export const DocumentChunkTable = pgTable(
  "document_chunk",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => DocumentTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // 0-indexed position within the document. Used to reconstruct the
    // original order after a similarity search.
    position: integer("position").notNull(),
    // 768-dim embedding. Nullable so we can backfill the column for
    // existing chunks in P2.3 if needed; the HNSW index is created
    // in the migration.
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("document_chunk_document_id_idx").on(table.documentId)],
);

export type CollectionEntity = typeof CollectionTable.$inferSelect;
export type CollectionItemEntity = typeof CollectionItemTable.$inferSelect;
export type DocumentEntity = typeof DocumentTable.$inferSelect;
export type DocumentChunkEntity = typeof DocumentChunkTable.$inferSelect;

/** Durable cleanup queue for blobs whose owning knowledge item was deleted. */
export const FileCleanupOutboxTable = pgTable(
  "file_cleanup_outbox",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id").notNull(),
    storageKey: text("storage_key").notNull(),
    status: varchar("status", { enum: ["pending", "processing", "complete"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastError: text("last_error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("file_cleanup_outbox_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("file_cleanup_outbox_storage_key_idx").on(table.storageKey),
  ],
);

// Multi-document tabular reviews. Sources use the existing knowledge-base
// item/document pipeline so review access inherits collection ownership.
export const TabularReviewTable = pgTable(
  "tabular_review",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    columns: jsonb("columns").notNull().$type<
      Array<{
        id: string;
        label: string;
        type: "text" | "date" | "boolean" | "list" | "score" | "citation";
        prompt: string;
      }>
    >(),
    status: varchar("status", {
      enum: ["pending", "generating", "done", "error"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("tabular_review_user_id_idx").on(table.userId)],
);

export const TabularReviewItemTable = pgTable(
  "tabular_review_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => TabularReviewTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
  },
  (table) => [
    index("tabular_review_item_review_idx").on(table.reviewId),
    unique("tabular_review_item_unique").on(table.reviewId, table.itemId),
  ],
);

export const TabularReviewCellTable = pgTable(
  "tabular_review_cell",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => TabularReviewTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    columnId: varchar("column_id", { length: 64 }).notNull(),
    value: text("value"),
    status: varchar("status", {
      enum: ["pending", "generating", "done", "error"],
    })
      .notNull()
      .default("pending"),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("tabular_review_cell_review_idx").on(table.reviewId),
    unique("tabular_review_cell_unique").on(
      table.reviewId,
      table.itemId,
      table.columnId,
    ),
  ],
);

export type TabularReviewEntity = typeof TabularReviewTable.$inferSelect;
export type TabularReviewItemEntity =
  typeof TabularReviewItemTable.$inferSelect;
export type TabularReviewCellEntity =
  typeof TabularReviewCellTable.$inferSelect;

// ============================================================================
// Phase 3 — Automation: Scheduler + Triggers + Webhooks (#11, #12, #24)
// ============================================================================
// All eight tables below are owned by a user (or scoped to a user through a
// subscription / job) and cascade on user delete. The `webhook_event_outbox`
// and `webhook_delivery` tables are worker-owned — they live independently
// of the subscription that produced them and are deleted on event /
// subscription cascade respectively.
// ----------------------------------------------------------------------------

// #11 — Scheduled agents. A `scheduled_job` is a user-owned cron-bound
// trigger for an agent or the default assistant. The worker transactionally
// leases due rows and fences completion by claim token. `payload` carries
// per-run inputs (e.g. `{"triggerMessage": "Summarize my day"}`).
export const ScheduledJobTable = pgTable(
  "scheduled_job",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => AgentTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    claimToken: uuid("claim_token"),
    claimExpiresAt: timestamp("claim_expires_at"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("scheduled_job_status_next_run_at_idx").on(
      table.status,
      table.nextRunAt,
    ),
    index("scheduled_job_user_id_idx").on(table.userId),
  ],
);

export type ScheduledJob = typeof ScheduledJobTable.$inferSelect;
export type NewScheduledJob = typeof ScheduledJobTable.$inferInsert;

// Idempotency tombstones for approved agent schedules. Keeping the request
// separate from scheduled_job means a deleted schedule cannot be recreated by
// replaying an old approval after a lost response.
export const ScheduledJobCreationRequestTable = pgTable(
  "scheduled_job_creation_request",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    requestKey: varchar("request_key", { length: 200 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    scheduledJobId: uuid("scheduled_job_id").references(
      () => ScheduledJobTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      name: "scheduled_job_creation_request_pk",
      columns: [table.userId, table.requestKey],
    }),
    index("scheduled_job_creation_request_job_idx").on(table.scheduledJobId),
  ],
);

export type ScheduledJobCreationRequest =
  typeof ScheduledJobCreationRequestTable.$inferSelect;

// One row per attempted run. Status moves running -> completed | failed |
// skipped. `output` captures the LLM response / final message id when the
// run finishes; `error` carries the failure reason.
export const ScheduledRunTable = pgTable(
  "scheduled_run",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    scheduledJobId: uuid("scheduled_job_id")
      .notNull()
      .references(() => ScheduledJobTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: timestamp("completed_at"),
    status: text("status").notNull().default("running"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (table) => [
    index("scheduled_run_scheduled_job_id_idx").on(table.scheduledJobId),
    index("scheduled_run_status_started_at_idx").on(
      table.status,
      table.startedAt,
    ),
  ],
);

export type ScheduledRun = typeof ScheduledRunTable.$inferSelect;
export type NewScheduledRun = typeof ScheduledRunTable.$inferInsert;

/** Durable, owner-scoped manual execution requests, replay-safe by key. */
export const ScheduledJobManualRunRequestTable = pgTable(
  "scheduled_job_manual_run_request",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    scheduledJobId: uuid("scheduled_job_id").references(
      () => ScheduledJobTable.id,
      { onDelete: "set null" },
    ),
    requestKey: varchar("request_key", { length: 200 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimToken: uuid("claim_token"),
    claimExpiresAt: timestamp("claim_expires_at"),
    scheduledRunId: uuid("scheduled_run_id").references(
      () => ScheduledRunTable.id,
      { onDelete: "set null" },
    ),
    lastError: text("last_error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      name: "scheduled_job_manual_run_request_pk",
      columns: [table.userId, table.requestKey],
    }),
    uniqueIndex("scheduled_job_manual_run_request_id_unique").on(table.id),
    uniqueIndex("scheduled_job_manual_run_request_pending_job_unique")
      .on(table.scheduledJobId)
      .where(sql`${table.status} IN ('pending', 'processing')`),
    index("scheduled_job_manual_run_request_claim_idx").on(
      table.status,
      table.claimExpiresAt,
      table.createdAt,
    ),
  ],
);

export type ScheduledJobManualRunRequest =
  typeof ScheduledJobManualRunRequestTable.$inferSelect;

// User-visible alerts and browser push endpoints. Push key material is
// encrypted by the repository before it reaches these columns.
export const NotificationTable = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    href: varchar("href", { length: 512 }),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("notification_user_created_idx").on(table.userId, table.createdAt),
    index("notification_user_unread_idx").on(table.userId, table.readAt),
    uniqueIndex("notification_user_dedupe_idx").on(
      table.userId,
      table.dedupeKey,
    ),
  ],
);

export const PushSubscriptionTable = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dhEncrypted: text("p256dh_encrypted").notNull(),
    authEncrypted: text("auth_encrypted").notNull(),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("push_subscription_user_endpoint_unique").on(
      table.userId,
      table.endpoint,
    ),
    index("push_subscription_user_idx").on(table.userId),
  ],
);

export type Notification = typeof NotificationTable.$inferSelect;
export type PushSubscription = typeof PushSubscriptionTable.$inferSelect;

export const VoiceDeviceTable = pgTable(
  "voice_device",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    deviceType: varchar("device_type", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    firmwareVersion: varchar("firmware_version", { length: 40 }),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("voice_device_user_idx").on(table.userId),
    index("voice_device_status_idx").on(table.status),
  ],
);

export const VoiceDevicePairingCodeTable = pgTable(
  "voice_device_pairing_code",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    deviceType: varchar("device_type", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 80 }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("voice_pairing_user_idx").on(table.userId),
    index("voice_pairing_expires_idx").on(table.expiresAt),
  ],
);

export const VoiceDeviceRegistrationTable = pgTable(
  "voice_device_registration",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    codeHash: text("code_hash").notNull().unique(),
    bootstrapSecretHash: text("bootstrap_secret_hash").notNull(),
    deviceType: varchar("device_type", { length: 64 }).notNull(),
    firmwareVersion: varchar("firmware_version", { length: 40 }),
    hardwareId: varchar("hardware_id", { length: 64 }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    userId: uuid("user_id").references(() => UserTable.id, {
      onDelete: "cascade",
    }),
    organizationId: text("organization_id"),
    deviceId: uuid("device_id").references(() => VoiceDeviceTable.id, {
      onDelete: "set null",
    }),
    displayName: varchar("display_name", { length: 80 }),
    encryptedDeviceToken: text("encrypted_device_token"),
    expiresAt: timestamp("expires_at").notNull(),
    claimedAt: timestamp("claimed_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("voice_device_registration_user_idx").on(table.userId),
    index("voice_device_registration_expiry_idx").on(table.expiresAt),
    index("voice_device_registration_hardware_idx").on(table.hardwareId),
  ],
);

export const VoiceDeviceSessionTable = pgTable(
  "voice_device_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => VoiceDeviceTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    segmentCount: integer("segment_count").notNull().default(0),
    startedAt: timestamp("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastSegmentAt: timestamp("last_segment_at"),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("voice_device_session_device_session_unique").on(
      table.deviceId,
      table.sessionId,
    ),
    index("voice_device_session_user_started_idx").on(
      table.userId,
      table.startedAt,
    ),
  ],
);

export const VoiceDeviceTranscriptSegmentTable = pgTable(
  "voice_device_transcript_segment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionPk: uuid("session_pk")
      .notNull()
      .references(() => VoiceDeviceSessionTable.id, { onDelete: "cascade" }),
    eventId: varchar("event_id", { length: 200 }).notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    text: varchar("text", { length: 8_000 }).notNull(),
    language: varchar("language", { length: 32 }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("voice_device_segment_session_event_unique").on(
      table.sessionPk,
      table.eventId,
    ),
    uniqueIndex("voice_device_segment_session_sequence_unique").on(
      table.sessionPk,
      table.sequenceNumber,
    ),
    index("voice_device_segment_session_created_idx").on(
      table.sessionPk,
      table.createdAt,
    ),
  ],
);

export type VoiceDevice = typeof VoiceDeviceTable.$inferSelect;
export type VoiceDevicePairingCode =
  typeof VoiceDevicePairingCodeTable.$inferSelect;
export type VoiceDeviceRegistration =
  typeof VoiceDeviceRegistrationTable.$inferSelect;
export type VoiceDeviceSession = typeof VoiceDeviceSessionTable.$inferSelect;
export type VoiceDeviceTranscriptSegment =
  typeof VoiceDeviceTranscriptSegmentTable.$inferSelect;

// #12 — Inbound triggers. An `inbound_endpoint` is a user-owned URL token
// (e.g. `/api/inbound/[token]`) that the platform calls when something
// happens externally (webhook, email inbound parse, slack event). `token`
// is the unique URL segment; `secret_hash` is the HMAC of a shared secret
// (never store plaintext). `kind` is application-side enum'd.
export const InboundEndpointTable = pgTable(
  "inbound_endpoint",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    secretHash: text("secret_hash"),
    kind: text("kind").notNull(),
    threadTemplate: jsonb("thread_template")
      .$type<Record<string, unknown>>()
      .default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inbound_endpoint_user_id_idx").on(table.userId),
    index("inbound_endpoint_kind_enabled_idx").on(table.kind, table.enabled),
  ],
);

export type InboundEndpoint = typeof InboundEndpointTable.$inferSelect;
export type NewInboundEndpoint = typeof InboundEndpointTable.$inferInsert;

// One row per inbound call. `payload` is the full raw payload (email body,
// Slack message, etc.) — we keep it verbatim so the LLM pass has full
// context and so failed deliveries can be replayed manually. Status moves
// received -> normalized | failed | replayed.
export const InboundDeliveryTable = pgTable(
  "inbound_delivery",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    inboundEndpointId: uuid("inbound_endpoint_id")
      .notNull()
      .references(() => InboundEndpointTable.id, { onDelete: "cascade" }),
    receivedAt: timestamp("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    status: text("status").notNull().default("received"),
    error: text("error"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  },
  (table) => [
    index("inbound_delivery_inbound_endpoint_id_idx").on(
      table.inboundEndpointId,
    ),
    index("inbound_delivery_status_received_at_idx").on(
      table.status,
      table.receivedAt,
    ),
  ],
);

export type InboundDelivery = typeof InboundDeliveryTable.$inferSelect;
export type NewInboundDelivery = typeof InboundDeliveryTable.$inferInsert;

// #24 — Public REST API keys. `key_hash` is the sha-256 of the full key —
// we never store the plaintext. `prefix` is the first 8 chars of the key
// (e.g. `ck_live_xxxx...`) so the dashboard can render "ck_live_xxxx…"
// without revealing the secret. `scopes` is a text[] of permission
// strings; `revoked_at` is set to non-null when the key is retired.
export const ApiKeyTable = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    // P5.0 — #24 hardening. Rotation metadata lets the API accept
    // a freshly-issued replacement while the old key remains in a
    // short grace window. `last_four` is UI-safe display metadata.
    rotatedFromKeyId: uuid("rotated_from_key_id").references(
      (): AnyPgColumn => ApiKeyTable.id,
      { onDelete: "set null" },
    ),
    rotationGraceEndsAt: timestamp("rotation_grace_ends_at"),
    lastFour: text("last_four"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("api_key_key_hash_unique").on(table.keyHash),
    index("api_key_user_id_idx").on(table.userId),
    index("api_key_prefix_idx").on(table.prefix),
    index("api_key_rotated_from_key_id_idx").on(table.rotatedFromKeyId),
    index("api_key_rotation_grace_ends_at_idx").on(table.rotationGraceEndsAt),
  ],
);

export type ApiKey = typeof ApiKeyTable.$inferSelect;
export type NewApiKey = typeof ApiKeyTable.$inferInsert;

// A user-owned HTTP endpoint that wants to receive event notifications.
// `event_types` is a text[] of subscribed events (e.g.
// `["thread.created", "message.created"]`); an empty array means
// "subscribe to everything". `secret_hash` is the HMAC of the signing
// secret — used at delivery time to compute the X-Signature header.
//
// `signing_secret` is the PLAINTEXT signing secret used by the outbox
// worker to compute the HMAC on outgoing payloads. This is a known
// limitation: the secret is stored in plaintext so the worker can sign
// without the round-trip cost of reversible encryption. Encrypt-at-rest
// is deferred to a Phase 4+ hardening pass — see migration
// `0024_webhook_signing_secret.sql` for the add-column rationale.
export const WebhookSubscriptionTable = pgTable(
  "webhook_subscription",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    eventTypes: text("event_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    secretHash: text("secret_hash").notNull(),
    // P3.4 — plaintext signing secret for the outbox worker. NULL for
    // pre-P3.4 subscriptions; the worker treats NULL as "skip".
    signingSecret: text("signing_secret"),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    // P5.0 — webhook health counters for management / delivery UI.
    failureCount: integer("failure_count").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at"),
    lastFailureAt: timestamp("last_failure_at"),
    lastFailureReason: text("last_failure_reason"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("webhook_subscription_user_id_idx").on(table.userId),
    index("webhook_subscription_enabled_idx").on(table.enabled),
    index("webhook_subscription_user_id_enabled_idx").on(
      table.userId,
      table.enabled,
    ),
    index("webhook_subscription_failure_count_idx").on(table.failureCount),
  ],
);

export type WebhookSubscription = typeof WebhookSubscriptionTable.$inferSelect;
export type NewWebhookSubscription =
  typeof WebhookSubscriptionTable.$inferInsert;

// The outbox is the durability layer for webhook fan-out. The platform
// writes a single row per logical event; a worker fans it out into one
// `webhook_delivery` row per subscriber. `kind` is application-side
// enum'd (`inbound` for #12, `outbound` for #24). Status moves
// pending -> delivering -> delivered | failed; `attempts` counts failed
// deliveries; `max_attempts` is the per-event retry cap (default 5);
// `next_attempt_at` drives the worker poll.
export const WebhookEventOutboxTable = pgTable(
  "webhook_event_outbox",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    kind: text("kind").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastError: text("last_error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("webhook_event_outbox_status_next_attempt_at_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("webhook_event_outbox_event_type_idx").on(table.eventType),
    index("webhook_event_outbox_kind_idx").on(table.kind),
  ],
);

export type WebhookEventOutbox = typeof WebhookEventOutboxTable.$inferSelect;
export type NewWebhookEventOutbox = typeof WebhookEventOutboxTable.$inferInsert;

// One row per (event, subscriber). UNIQUE (event_id, subscription_id) so
// we never deliver the same event twice to the same subscriber. The worker
// processes this table, not the outbox directly.
export const WebhookDeliveryTable = pgTable(
  "webhook_delivery",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => WebhookEventOutboxTable.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => WebhookSubscriptionTable.id, {
        onDelete: "cascade",
      }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("webhook_delivery_event_subscription_unique").on(
      table.eventId,
      table.subscriptionId,
    ),
    index("webhook_delivery_event_id_idx").on(table.eventId),
    index("webhook_delivery_subscription_id_idx").on(table.subscriptionId),
    index("webhook_delivery_status_idx").on(table.status),
  ],
);

export type WebhookDelivery = typeof WebhookDeliveryTable.$inferSelect;
export type NewWebhookDelivery = typeof WebhookDeliveryTable.$inferInsert;

// ============================================================================
// Phase 5 — External surface: Widget + API hardening (#16, #24 hardening)
// ============================================================================

// #16 — Anonymous embedded-chat sessions. These are scoped to one public
// agent and may optionally retain the publishing user for owner dashboards.
// `anonymous_token` is the external lookup key; later agents will mint a
// short-lived JWT from it without using Flare user auth.
export const EmbedSessionTable = pgTable(
  "embed_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    anonymousToken: text("anonymous_token").notNull().unique(),
    rateLimitTier: text("rate_limit_tier")
      .notNull()
      .$type<SubscriptionTierName>()
      .default(DEFAULT_SUBSCRIPTION_TIER),
    dailyMessageCount: integer("daily_message_count").notNull().default(0),
    dailyResetAt: timestamp("daily_reset_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    firstMessageCaptchaAt: timestamp("first_message_captcha_at"),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("embed_session_agent_id_idx").on(table.agentId),
    index("embed_session_anonymous_token_idx").on(table.anonymousToken),
    index("embed_session_expires_at_idx").on(table.expiresAt),
    index("embed_session_revoked_at_idx").on(table.revokedAt),
  ],
);

export type EmbedSession = typeof EmbedSessionTable.$inferSelect;
export type NewEmbedSession = typeof EmbedSessionTable.$inferInsert;

// #24 — Per-key usage events. The dashboard summarizes this append-only
// table by day / route / status; the API gateway writes one row per request.
export const ApiKeyUsageTable = pgTable(
  "api_key_usage",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => ApiKeyTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    method: text("method").notNull(),
    status: integer("status").notNull(),
    costUnits: integer("cost_units").notNull().default(1),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("api_key_usage_api_key_id_created_at_idx").on(
      table.apiKeyId,
      table.createdAt,
    ),
    index("api_key_usage_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export type ApiKeyUsage = typeof ApiKeyUsageTable.$inferSelect;
export type NewApiKeyUsage = typeof ApiKeyUsageTable.$inferInsert;

// #24 — Generic rate-limit counters. `key` encodes the limiter dimension
// (`api_key:<id>:day`, `ip:<hash>:minute`, `embed:<sessionId>:day`).
export const ApiRateLimitBucketTable = pgTable(
  "api_rate_limit_bucket",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("api_rate_limit_bucket_reset_at_idx").on(table.resetAt)],
);

export type ApiRateLimitBucket = typeof ApiRateLimitBucketTable.$inferSelect;
export type NewApiRateLimitBucket = typeof ApiRateLimitBucketTable.$inferInsert;

// ============================================================================
// Phase 4 — Sharing: Marketplace + Gallery + Teams (#14, #15, #19) + Stripe
// ============================================================================
//
// All six tables below are owned by a user. The marketplace / gallery install
// tables (mcp_server_install, agent_install) carry a nullable `org_id` so a
// team can install a shared resource on behalf of all members. The team
// tables (team, team_member) are Better Auth `organization`-plugin-
// compatible — P4.A enables the plugin and wires the onUserCreate hook.
// `subscription` is the Stripe prereq (#19) consumed by the webhook that
// P4.B authors. `agent_view` is a high-volume analytics table with no
// unique constraint — anonymous views are permitted (user_id NULL with
// ON DELETE SET NULL).
// ----------------------------------------------------------------------------

// #14 — MCP marketplace install. `config` is the user's per-install
// overrides (e.g. env var values, custom headers) — kept as a jsonb
// blob so the marketplace can extend the schema without further
// migrations. UNIQUE (user_id, mcp_server_id) so a user can install
// each server at most once.
export const McpServerInstallTable = pgTable(
  "mcp_server_install",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // Forward reference to team(id). NULL = personal install;
    // non-null = team install. The migration adds the FK in a later
    // step (after `team` is created).
    orgId: uuid("org_id"),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("mcp_server_install_user_id_mcp_server_id_unique").on(
      table.userId,
      table.mcpServerId,
    ),
    index("mcp_server_install_user_id_idx").on(table.userId),
    index("mcp_server_install_mcp_server_id_idx").on(table.mcpServerId),
    index("mcp_server_install_org_id_idx").on(table.orgId),
  ],
);

export type McpServerInstall = typeof McpServerInstallTable.$inferSelect;
export type NewMcpServerInstall = typeof McpServerInstallTable.$inferInsert;

// #15 — Agent gallery install. Same shape as the MCP install table
// but scoped to the agent table. UNIQUE (user_id, agent_id).
export const AgentInstallTable = pgTable(
  "agent_install",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("agent_install_user_id_agent_id_unique").on(
      table.userId,
      table.agentId,
    ),
    index("agent_install_user_id_idx").on(table.userId),
    index("agent_install_agent_id_idx").on(table.agentId),
    index("agent_install_org_id_idx").on(table.orgId),
  ],
);

export type AgentInstall = typeof AgentInstallTable.$inferSelect;
export type NewAgentInstall = typeof AgentInstallTable.$inferInsert;

// Analytics: one row per gallery page view. userId is nullable
// (anonymous views permitted); referrer is the upstream URL the user
// came from. No unique constraint — high-volume append-only. The
// agent_view_agent_id_viewed_at_idx index is created in the migration
// so the count-by-day query can scan a tight range.
export const AgentViewTable = pgTable(
  "agent_view",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    viewedAt: timestamp("viewed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    referrer: text("referrer"),
  },
  (table) => [
    index("agent_view_agent_id_viewed_at_idx").on(
      table.agentId,
      table.viewedAt,
    ),
    index("agent_view_user_id_idx").on(table.userId),
  ],
);

export type AgentView = typeof AgentViewTable.$inferSelect;
export type NewAgentView = typeof AgentViewTable.$inferInsert;

// #19 — Team. Better Auth `organization`-plugin-compatible. `slug`
// is the URL-safe handle. `plan` is application-side enum'd
// (free|team|business) — a CHECK constraint is created in the
// migration. `stripe_customer_id` / `stripe_subscription_id` are
// nullable; they are populated when the team subscribes to a paid
// plan via the Stripe webhook in P4.B.
export const TeamTable = pgTable(
  "team",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("team_owner_id_idx").on(table.ownerId),
    index("team_plan_idx").on(table.plan),
  ],
);

export type Team = typeof TeamTable.$inferSelect;
export type NewTeam = typeof TeamTable.$inferInsert;

// Team membership. `role` is application-side enum'd
// (owner|admin|member|viewer) — a CHECK constraint is created in the
// migration. UNIQUE (team_id, user_id) so a user belongs to a team
// at most once.
export const TeamMemberTable = pgTable(
  "team_member",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => TeamTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("team_member_team_id_user_id_unique").on(table.teamId, table.userId),
    index("team_member_user_id_idx").on(table.userId),
  ],
);

export type TeamMember = typeof TeamMemberTable.$inferSelect;
export type NewTeamMember = typeof TeamMemberTable.$inferInsert;

/** Per-team-seat monthly spend policy, reservation ledger and finalized usage. */
export const TeamMemberAiPolicyTable = pgTable("team_member_ai_policy", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => TeamMemberTable.id, { onDelete: "cascade" }),
  monthlyCapMicros: bigint("monthly_cap_micros", { mode: "number" }),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  hardStop: boolean("hard_stop").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const TeamMemberAiUsagePeriodTable = pgTable(
  "team_member_ai_usage_period",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => TeamMemberTable.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    finalizedMicros: bigint("finalized_micros", { mode: "number" })
      .notNull()
      .default(0),
    reservedMicros: bigint("reserved_micros", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("team_member_ai_usage_period_member_start_unique").on(
      table.memberId,
      table.periodStart,
    ),
    index("team_member_ai_usage_period_member_idx").on(table.memberId),
  ],
);

export const TeamMemberAiReservationTable = pgTable(
  "team_member_ai_reservation",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    usagePeriodId: uuid("usage_period_id")
      .notNull()
      .references(() => TeamMemberAiUsagePeriodTable.id, {
        onDelete: "cascade",
      }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => TeamTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    modelKey: text("model_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    estimateMicros: bigint("estimate_micros", { mode: "number" }).notNull(),
    actualMicros: bigint("actual_micros", { mode: "number" }),
    status: varchar("status", { length: 16 }).notNull().default("reserved"),
    expiresAt: timestamp("expires_at").notNull(),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("team_member_ai_reservation_period_idx").on(table.usagePeriodId),
    index("team_member_ai_reservation_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);

// Project workspace adapted to Void-Agent's Team/TeamMember model. A null
// teamId is personal; teamId makes access follow current team membership.
export const ProjectTable = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => TeamTable.id, {
      onDelete: "cascade",
    }),
    // Existing team projects retain inherited team access. Owners may opt in
    // to a selected-member allowlist without changing legacy project access.
    accessMode: text("access_mode")
      .$type<"team" | "selected">()
      .notNull()
      .default("team"),
    name: text("name").notNull(),
    description: text("description"),
    goal: text("goal"),
    systemPrompt: text("system_prompt"),
    collectionIds: uuid("collection_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_user_id_idx").on(table.userId),
    index("project_team_id_idx").on(table.teamId),
  ],
);

export type ProjectEntity = typeof ProjectTable.$inferSelect;

/** Explicit project collaborators used only when accessMode is `selected`. */
export const ProjectMemberTable = pgTable(
  "project_member",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    role: text("role").$type<"viewer" | "editor">().notNull().default("viewer"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_member_project_id_user_id_unique").on(
      table.projectId,
      table.userId,
    ),
    index("project_member_project_id_idx").on(table.projectId),
    index("project_member_user_id_idx").on(table.userId),
  ],
);

export type ProjectMemberEntity = typeof ProjectMemberTable.$inferSelect;

/** Links a ready knowledge source to the project file-management surface. */
export const ProjectDocumentTable = pgTable(
  "project_document",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    collectionItemId: uuid("collection_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("project_document_project_item_idx").on(
      table.projectId,
      table.collectionItemId,
    ),
    uniqueIndex("project_document_project_id_unique_idx").on(
      table.projectId,
      table.id,
    ),
    index("project_document_project_id_idx").on(table.projectId),
  ],
);

export const PROJECT_DOCUMENT_EDIT_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "stale",
] as const;

/** One reviewable tracked-change artifact for an immutable project source version. */
export const ProjectDocumentEditTable = pgTable(
  "project_document_edit",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    projectDocumentId: uuid("project_document_id").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // SHA-256 of the exact original bytes. Resolution re-checks it so an
    // artifact cannot be accepted against a replaced source file.
    sourceRevisionHash: varchar("source_revision_hash", {
      length: 64,
    }).notNull(),
    proposedEdits: jsonb("proposed_edits")
      .$type<
        Array<{
          originalText: string;
          suggestedText: string;
          rationale: string;
        }>
      >()
      .notNull(),
    trackedChanges: jsonb("tracked_changes")
      .$type<Array<{ id: string; delId?: string; insId?: string }>>()
      .notNull(),
    // Private object key for the generated OOXML package. Rejection atomically
    // moves it to the cleanup outbox; accepted files remain downloadable.
    candidateStorageKey: text("candidate_storage_key"),
    outputStorageKey: text("output_storage_key"),
    status: varchar("status", { enum: PROJECT_DOCUMENT_EDIT_STATUSES })
      .notNull()
      .default("pending"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_document_edit_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("project_document_edit_document_created_idx").on(
      table.projectDocumentId,
      table.createdAt,
    ),
    index("project_document_edit_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.projectId, table.projectDocumentId],
      foreignColumns: [ProjectDocumentTable.projectId, ProjectDocumentTable.id],
      name: "project_document_edit_project_document_fk",
    }).onDelete("cascade"),
    check(
      "project_document_edit_source_hash_check",
      sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "project_document_edit_edits_check",
      sql`jsonb_typeof(${table.proposedEdits}) = 'array' AND jsonb_array_length(${table.proposedEdits}) BETWEEN 1 AND 50`,
    ),
    check(
      "project_document_edit_tracked_changes_check",
      sql`jsonb_typeof(${table.trackedChanges}) = 'array' AND jsonb_array_length(${table.trackedChanges}) BETWEEN 1 AND 50`,
    ),
    check(
      "project_document_edit_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'rejected', 'stale')`,
    ),
    check(
      "project_document_edit_lifecycle_check",
      sql`(${table.status} = 'pending' AND ${table.candidateStorageKey} IS NOT NULL AND ${table.outputStorageKey} IS NULL AND ${table.resolvedAt} IS NULL) OR (${table.status} = 'accepted' AND ${table.candidateStorageKey} IS NULL AND ${table.outputStorageKey} IS NOT NULL AND ${table.resolvedAt} IS NOT NULL) OR (${table.status} IN ('rejected', 'stale') AND ${table.candidateStorageKey} IS NULL AND ${table.outputStorageKey} IS NULL AND ${table.resolvedAt} IS NOT NULL)`,
    ),
  ],
);

export type ProjectDocumentEditEntity =
  typeof ProjectDocumentEditTable.$inferSelect;

/** Project-scoped MCP connections only retain explicitly read-only tool names. */
export const ProjectBrainMcpConnectorTable = pgTable(
  "project_brain_mcp_connector",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    credentialOwnerUserId: uuid("credential_owner_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => CollectionTable.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    toolNames: jsonb("tool_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_mcp_connector_project_server_unique").on(
      table.projectId,
      table.mcpServerId,
    ),
    index("project_brain_mcp_connector_project_idx").on(table.projectId),
  ],
);

export const ProjectBrainMcpSyncRunTable = pgTable(
  "project_brain_mcp_sync_run",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => ProjectBrainMcpConnectorTable.id, {
        onDelete: "cascade",
      }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    sourceItemId: uuid("source_item_id").references(
      () => CollectionItemTable.id,
      { onDelete: "set null" },
    ),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_mcp_sync_idempotency_unique").on(
      table.connectorId,
      table.idempotencyKey,
    ),
    index("project_brain_mcp_sync_run_connector_idx").on(
      table.connectorId,
      table.createdAt,
    ),
  ],
);

export const ProjectBrainMcpSyncSourceTable = pgTable(
  "project_brain_mcp_sync_source",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => ProjectBrainMcpConnectorTable.id, {
        onDelete: "cascade",
      }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .unique()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    sourceFingerprint: varchar("source_fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_brain_mcp_sync_source_connector_idx").on(table.connectorId),
    unique("project_brain_mcp_sync_source_fingerprint_unique").on(
      table.connectorId,
      table.sourceFingerprint,
    ),
  ],
);

export const ProjectBrainComposioConnectorTable = pgTable(
  "project_brain_composio_connector",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    credentialOwnerUserId: uuid("credential_owner_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => CollectionTable.id, { onDelete: "cascade" }),
    toolkitSlug: varchar("toolkit_slug", { length: 128 }).notNull(),
    connectedAccountId: varchar("connected_account_id", {
      length: 256,
    }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    readActionSlugs: jsonb("read_action_slugs")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_composio_connector_identity_unique").on(
      table.projectId,
      table.connectedAccountId,
    ),
    index("project_brain_composio_connector_project_idx").on(table.projectId),
  ],
);

export const ProjectBrainComposioSyncRunTable = pgTable(
  "project_brain_composio_sync_run",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => ProjectBrainComposioConnectorTable.id, {
        onDelete: "cascade",
      }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    sourceItemId: uuid("source_item_id").references(
      () => CollectionItemTable.id,
      { onDelete: "set null" },
    ),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_composio_sync_idempotency_unique").on(
      table.connectorId,
      table.idempotencyKey,
    ),
    index("project_brain_composio_sync_run_connector_idx").on(
      table.connectorId,
      table.createdAt,
    ),
  ],
);

export const ProjectBrainComposioSyncSourceTable = pgTable(
  "project_brain_composio_sync_source",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => ProjectBrainComposioConnectorTable.id, {
        onDelete: "cascade",
      }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .unique()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    sourceFingerprint: varchar("source_fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_brain_composio_sync_source_connector_idx").on(
      table.connectorId,
    ),
    unique("project_brain_composio_sync_source_fingerprint_unique").on(
      table.connectorId,
      table.sourceFingerprint,
    ),
  ],
);

/** Immutable metadata for one exact source-content revision analyzed by a project. */
export const ProjectBrainSourceVersionTable = pgTable(
  "project_brain_source_version",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    contentSnapshot: text("content_snapshot"),
    contentLength: integer("content_length").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_source_version_revision_unique").on(
      table.projectId,
      table.sourceItemId,
      table.sourceFingerprint,
    ),
    unique("project_brain_source_version_identity_unique").on(
      table.id,
      table.projectId,
      table.sourceItemId,
    ),
    index("project_brain_source_version_item_created_idx").on(
      table.projectId,
      table.sourceItemId,
      table.createdAt,
    ),
  ],
);

/** Latest explicitly analyzed revision for each project/source pair. */
export const ProjectBrainSourceStateTable = pgTable(
  "project_brain_source_state",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => ProjectBrainSourceVersionTable.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.sourceItemId] }),
    index("project_brain_source_state_version_idx").on(table.sourceVersionId),
  ],
);

export const ProjectBrainRunTable = pgTable(
  "project_brain_run",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => ProjectBrainSourceVersionTable.id, {
        onDelete: "cascade",
      }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    factCount: integer("fact_count").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_run_project_fingerprint_unique").on(
      table.projectId,
      table.sourceFingerprint,
    ),
    index("project_brain_run_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

/** Durable, idempotent project-brain consolidation runs (separate from source ingests). */
export const ProjectBrainDreamRunTable = pgTable(
  "project_brain_dream_run",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull().$type<"manual" | "nightly">(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status")
      .notNull()
      .default("queued")
      .$type<"queued" | "running" | "partial" | "succeeded" | "failed">(),
    stage: text("stage")
      .notNull()
      .default("dedupe")
      .$type<
        "dedupe" | "contradictions" | "salience" | "archive" | "status" | "done"
      >(),
    attempts: integer("attempts").notNull().default(0),
    metrics: jsonb("metrics")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, Record<string, unknown>>>(),
    warnings: jsonb("warnings")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    unique("project_brain_dream_project_idempotency_unique").on(
      table.projectId,
      table.idempotencyKey,
    ),
    index("project_brain_dream_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("project_brain_dream_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    check(
      "project_brain_dream_reason_check",
      sql`${table.reason} IN ('manual', 'nightly')`,
    ),
    check(
      "project_brain_dream_status_check",
      sql`${table.status} IN ('queued', 'running', 'partial', 'succeeded', 'failed')`,
    ),
    check(
      "project_brain_dream_stage_check",
      sql`${table.stage} IN ('dedupe', 'contradictions', 'salience', 'archive', 'status', 'done')`,
    ),
  ],
);

/** Stable project-scoped identity records backed by reviewed fact claims. */
export const ProjectBrainPageTable = pgTable(
  "project_brain_page",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    normalizedTitle: varchar("normalized_title", { length: 160 }).notNull(),
    salience: real("salience").notNull().default(0),
    mergedIntoPageId: uuid("merged_into_page_id").references(
      (): AnyPgColumn => ProjectBrainPageTable.id,
      { onDelete: "set null" },
    ),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_page_project_type_title_unique").on(
      table.projectId,
      table.entityType,
      table.normalizedTitle,
    ),
    index("project_brain_page_project_idx").on(table.projectId),
    index("project_brain_page_project_title_idx").on(
      table.projectId,
      table.normalizedTitle,
    ),
  ],
);

/** A project editor's durable decision that two page IDs are distinct identities. */
export const ProjectBrainPagePairReviewTable = pgTable(
  "project_brain_page_pair_review",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    firstPageId: uuid("first_page_id")
      .notNull()
      .references(() => ProjectBrainPageTable.id, { onDelete: "cascade" }),
    secondPageId: uuid("second_page_id")
      .notNull()
      .references(() => ProjectBrainPageTable.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "project_brain_page_pair_review_sorted_check",
      sql`${table.firstPageId} < ${table.secondPageId}`,
    ),
    check(
      "project_brain_page_pair_review_distinct_check",
      sql`${table.firstPageId} <> ${table.secondPageId}`,
    ),
    unique("project_brain_page_pair_review_pair_unique").on(
      table.firstPageId,
      table.secondPageId,
    ),
    index("project_brain_page_pair_review_first_idx").on(table.firstPageId),
    index("project_brain_page_pair_review_second_idx").on(table.secondPageId),
  ],
);

export const ProjectBrainFactTable = pgTable(
  "project_brain_fact",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => ProjectBrainRunTable.id, { onDelete: "cascade" }),
    sourceVersionId: uuid("source_version_id").notNull(),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    subjectPageId: uuid("subject_page_id").references(
      () => ProjectBrainPageTable.id,
      { onDelete: "set null" },
    ),
    objectPageId: uuid("object_page_id").references(
      () => ProjectBrainPageTable.id,
      { onDelete: "set null" },
    ),
    subject: varchar("subject", { length: 160 }).notNull(),
    predicate: varchar("predicate", { length: 160 }).notNull(),
    object: varchar("object", { length: 500 }).notNull(),
    evidence: varchar("evidence", { length: 1200 }).notNull(),
    confidence: real("confidence").notNull().default(0.5),
    reviewStatus: text("review_status").notNull().default("proposed"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => [
    foreignKey({
      name: "project_brain_fact_source_revision_fk",
      columns: [table.sourceVersionId, table.projectId, table.sourceItemId],
      foreignColumns: [
        ProjectBrainSourceVersionTable.id,
        ProjectBrainSourceVersionTable.projectId,
        ProjectBrainSourceVersionTable.sourceItemId,
      ],
    }).onDelete("cascade"),
    index("project_brain_fact_project_status_idx").on(
      table.projectId,
      table.reviewStatus,
    ),
    index("project_brain_fact_source_idx").on(table.sourceItemId),
    index("project_brain_fact_source_version_idx").on(table.sourceVersionId),
  ],
);

/** Cross-source claim comparisons and their human review lifecycle. */
export const ProjectBrainContradictionTable = pgTable(
  "project_brain_contradiction",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => ProjectBrainPageTable.id, {
      onDelete: "set null",
    }),
    factIdA: uuid("fact_id_a")
      .notNull()
      .references(() => ProjectBrainFactTable.id, { onDelete: "cascade" }),
    factIdB: uuid("fact_id_b")
      .notNull()
      .references(() => ProjectBrainFactTable.id, { onDelete: "cascade" }),
    verdict: varchar("verdict", { length: 20 }).notNull().default("potential"),
    explanation: varchar("explanation", { length: 1200 }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(
      () => UserTable.id,
      {
        onDelete: "set null",
      },
    ),
    keptFactId: uuid("kept_fact_id").references(
      () => ProjectBrainFactTable.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_contradiction_fact_pair_unique").on(
      table.factIdA,
      table.factIdB,
    ),
    index("project_brain_contradiction_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);

/** Project brain task candidates remain proposals until an editor reviews them. */
export const ProjectBrainTodoTable = pgTable(
  "project_brain_todo",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => ProjectBrainRunTable.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => CollectionItemTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    details: varchar("details", { length: 1200 }).notNull().default(""),
    evidence: varchar("evidence", { length: 1200 }).notNull(),
    dueDate: date("due_date"),
    dedupeKey: varchar("dedupe_key", { length: 64 }).notNull(),
    status: text("status").notNull().default("proposed"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => [
    unique("project_brain_todo_run_dedupe_unique").on(
      table.runId,
      table.dedupeKey,
    ),
    index("project_brain_todo_project_status_idx").on(
      table.projectId,
      table.status,
    ),
    index("project_brain_todo_source_idx").on(table.sourceItemId),
  ],
);

/** Project-level status summaries are tied to the exact visible source revisions. */
export const ProjectBrainStatusSnapshotTable = pgTable(
  "project_brain_status_snapshot",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    generatedByUserId: uuid("generated_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    inputFingerprint: varchar("input_fingerprint", { length: 64 }).notNull(),
    sourceRefs: jsonb("source_refs")
      .$type<Array<{ sourceItemId: string; sourceVersionId: string }>>()
      .notNull(),
    health: varchar("health", { length: 20 }).notNull(),
    progressPct: real("progress_pct"),
    summary: varchar("summary", { length: 600 }).notNull().default(""),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_brain_status_snapshot_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("project_brain_status_snapshot_fingerprint_idx").on(
      table.projectId,
      table.inputFingerprint,
    ),
  ],
);

/** Alias rows retain provenance; consumers must honor the source fact's review status. */
export const ProjectBrainAliasTable = pgTable(
  "project_brain_alias",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => ProjectBrainPageTable.id, { onDelete: "cascade" }),
    sourceFactId: uuid("source_fact_id")
      .notNull()
      .references(() => ProjectBrainFactTable.id, { onDelete: "cascade" }),
    alias: varchar("alias", { length: 160 }).notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 160 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("project_brain_alias_source_identity_unique").on(
      table.projectId,
      table.pageId,
      table.normalizedAlias,
      table.sourceFactId,
    ),
    index("project_brain_alias_project_normalized_idx").on(
      table.projectId,
      table.normalizedAlias,
    ),
    index("project_brain_alias_page_idx").on(table.pageId),
  ],
);

/** Immutable actor and endpoint history for human-reviewed page merges. */
export const ProjectBrainPageMergeTable = pgTable(
  "project_brain_page_merge",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    survivorPageId: uuid("survivor_page_id")
      .notNull()
      .references(() => ProjectBrainPageTable.id, { onDelete: "cascade" }),
    mergedPageId: uuid("merged_page_id")
      .notNull()
      .references(() => ProjectBrainPageTable.id, { onDelete: "cascade" })
      .unique(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    survivorTitle: varchar("survivor_title", { length: 160 }).notNull(),
    mergedTitle: varchar("merged_title", { length: 160 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_brain_page_merge_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export type ProjectBrainRunEntity = typeof ProjectBrainRunTable.$inferSelect;
export type ProjectBrainPageEntity = typeof ProjectBrainPageTable.$inferSelect;
export type ProjectBrainFactEntity = typeof ProjectBrainFactTable.$inferSelect;
export type ProjectBrainAliasEntity =
  typeof ProjectBrainAliasTable.$inferSelect;
export type ProjectBrainPageMergeEntity =
  typeof ProjectBrainPageMergeTable.$inferSelect;

// Stripe prereq (#19) — `subscription` table for the webhook P4.B
// authors. `stripe_subscription_id` is the natural key (UNIQUE) so
// idempotent webhook handlers can upsert by it. `tier` matches
// `user.tier` (free|pro|team|business) so the webhook can keep the
// denormalized user.tier in sync.
export const SubscriptionTable = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => TeamTable.id, {
      onDelete: "cascade",
    }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id"),
    status: text("status").notNull(),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    tier: text("tier").notNull().default("free"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("subscription_user_id_idx").on(table.userId),
    index("subscription_org_id_idx").on(table.orgId),
    index("subscription_status_idx").on(table.status),
  ],
);

export type Subscription = typeof SubscriptionTable.$inferSelect;
export type NewSubscription = typeof SubscriptionTable.$inferInsert;

// ---------------------------------------------------------------------------
// E2B Build (AI app builder)
// ---------------------------------------------------------------------------
// One row per build. `sandboxId` is the live E2B sandbox handle: it lets the
// workspace reconnect to a running sandbox instead of regenerating the app,
// and lets a reaper reclaim sandboxes that outlive their session. Restored by
// migration 0032 (originally 0018, dropped by 0019 when Build was removed).
export const BuildJobTable = pgTable(
  "build_job",
  {
    id: text("id").primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id"),
    toolCallId: text("tool_call_id"),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    prompt: text("prompt").notNull(),
    framework: varchar("framework", { length: 32 }),
    title: text("title"),
    summary: text("summary"),
    files: json("files")
      .$type<{ path: string; content: string }[]>()
      .default([]),
    previewUrl: text("preview_url"),
    // E2B sandbox handle + expected reclaim time (see note above).
    sandboxId: text("sandbox_id"),
    sandboxExpiresAt: timestamp("sandbox_expires_at"),
    error: text("error"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("build_job_thread_id_idx").on(table.threadId),
    index("build_job_user_id_idx").on(table.userId),
  ],
);

export type BuildJobEntity = typeof BuildJobTable.$inferSelect;
export type NewBuildJob = typeof BuildJobTable.$inferInsert;

/** Encrypted, user-owned read-only Stripe connection for the Cockpit view. */
export const CockpitConnectionTable = pgTable(
  "cockpit_connection",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => TeamTable.id, {
      onDelete: "cascade",
    }),
    provider: varchar("provider", { length: 32 }).notNull().default("stripe"),
    // Stripe legacy single-secret column remains readable. Providers with
    // structured credentials store a JSON config in configEncrypted instead.
    secretEncrypted: text("secret_encrypted"),
    configEncrypted: text("config_encrypted"),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestOk: boolean("last_test_ok"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("cockpit_connection_personal_provider_unique")
      .on(table.userId, table.provider)
      .where(isNull(table.teamId)),
    uniqueIndex("cockpit_connection_team_provider_unique")
      .on(table.teamId, table.provider)
      .where(isNotNull(table.teamId)),
    index("cockpit_connection_user_idx").on(table.userId),
    check(
      "cockpit_connection_provider_check",
      sql`${table.provider} IN ('stripe', 'vercel', 'website', 'revolut', 'superlog', 'seo')`,
    ),
    check(
      "cockpit_connection_encrypted_config_check",
      sql`${table.secretEncrypted} IS NOT NULL OR ${table.configEncrypted} IS NOT NULL`,
    ),
  ],
);

export type CockpitConnectionEntity =
  typeof CockpitConnectionTable.$inferSelect;

/** Private in-product issue reports and their user-visible triage status. */
export const ProblemReportTable = pgTable(
  "problem_report",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    screenshots: jsonb("screenshots")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<ProblemReportScreenshot[]>(),
    context: jsonb("context").$type<ProblemReportContext>(),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("problem_report_user_created_idx").on(table.userId, table.createdAt),
    index("problem_report_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "problem_report_status_check",
      sql`${table.status} IN ('open', 'in_review', 'resolved')`,
    ),
  ],
);

export type ProblemReportEntity = typeof ProblemReportTable.$inferSelect;
