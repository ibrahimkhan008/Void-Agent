import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { UserTable } from "./schema.pg";

// 1. Cyber Researcher Profiles (Internal & Admin Governed)
export const CyberResearcherProfileTable = pgTable(
  "cyber_researcher_profile",
  {
    userId: uuid("user_id")
      .primaryKey()
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    accessTier: integer("access_tier").notNull().default(1), // 1: Auditor, 2: Researcher, 3: Admin
    role: varchar("role", { length: 32 }).notNull().default("researcher"), // admin, researcher, auditor
    status: varchar("status", { length: 32 }).notNull().default("active"), // active, suspended, revoked
    voidTrustScore: integer("void_trust_score").notNull().default(500), // 0 - 1000
    mfaEnforced: boolean("mfa_enforced").notNull().default(false),
    invitedByUserId: uuid("invited_by_user_id").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roleIdx: index("cyber_profile_role_idx").on(table.role),
    statusIdx: index("cyber_profile_status_idx").on(table.status),
  }),
);

// 2. Native Target Programs (Phase 1: In-App Created)
export const CyberProgramTable = pgTable(
  "cyber_program",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    programHandle: varchar("program_handle", { length: 128 })
      .notNull()
      .unique(),
    description: text("description"),
    policyMarkdown: text("policy_markdown"),
    hasBounties: boolean("has_bounties").notNull().default(false),
    currency: varchar("currency", { length: 8 }).default("USD"),
    rulesMetadata: jsonb("rules_metadata").notNull().default({}), // e.g. { excludedCategories: [], rateLimits: {} }
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    handleIdx: index("cyber_program_handle_idx").on(table.programHandle),
    creatorIdx: index("cyber_program_creator_idx").on(table.createdByUserId),
  }),
);

// 3. Target Program Asset Scopes (In-Scope & Out-of-Scope)
export const CyberProgramScopeTable = pgTable(
  "cyber_program_scope",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => CyberProgramTable.id, { onDelete: "cascade" }),
    assetIdentifier: text("asset_identifier").notNull(), // *.example.com, 192.168.1.0/24, com.app.android
    assetType: varchar("asset_type", { length: 32 }).notNull(), // url, domain, wildcard, cidr, mobile_app
    isInScope: boolean("is_in_scope").notNull().default(true), // true = eligible, false = strictly prohibited
    maxSeverityAllowed: varchar("max_severity_allowed", { length: 32 }),
    instructionNotes: text("instruction_notes"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    programAssetIdx: index("cyber_scope_program_asset_idx").on(
      table.programId,
      table.assetIdentifier,
    ),
    inScopeIdx: index("cyber_scope_is_in_scope_idx").on(
      table.programId,
      table.isInScope,
    ),
  }),
);

// 4. Research Workspaces / Sessions
export const CyberSessionTable = pgTable(
  "cyber_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => CyberProgramTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active, paused, archived
    sandboxId: varchar("sandbox_id", { length: 128 }),
    sandboxProxyToken: text("sandbox_proxy_token"),
    assignedAgents: jsonb("assigned_agents").notNull().default([]), // ['recon', 'web', 'api', 'verifier']
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userSessionIdx: index("cyber_session_user_idx").on(table.userId),
    programSessionIdx: index("cyber_session_program_idx").on(table.programId),
  }),
);

// 5. Security Findings & Proof-of-Concepts
export const CyberFindingTable = pgTable(
  "cyber_finding",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => CyberSessionTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    cweId: varchar("cwe_id", { length: 32 }), // e.g. CWE-89, CWE-287
    cvssScore: varchar("cvss_score", { length: 16 }), // e.g. 8.5
    severity: varchar("severity", { length: 32 }).notNull(), // info, low, medium, high, critical
    affectedAsset: text("affected_asset").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("candidate"), // candidate, verified, reported
    reproductionSteps: text("reproduction_steps").notNull(),
    proofOfConcept: text("proof_of_concept").notNull(),
    impactDescription: text("impact_description").notNull(),
    remediationGuidance: text("remediation_guidance"),
    rawToolOutputs: jsonb("raw_tool_outputs").default({}),
    verificationLog: text("verification_log"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sessionFindingIdx: index("cyber_finding_session_idx").on(table.sessionId),
    severityIdx: index("cyber_finding_severity_idx").on(table.severity),
    statusIdx: index("cyber_finding_status_idx").on(table.status),
  }),
);

// 6. Evidence Vault (Tamper-Evident Artifacts)
export const CyberEvidenceVaultTable = pgTable(
  "cyber_evidence_vault",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => CyberFindingTable.id, { onDelete: "cascade" }),
    evidenceType: varchar("evidence_type", { length: 32 }).notNull(), // http_trace, screenshot, poc_script, terminal_log
    sha256Hash: varchar("sha256_hash", { length: 64 }).notNull(),
    payloadBytes: text("payload_bytes").notNull(),
    capturedAt: timestamp("captured_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    findingEvidenceIdx: index("cyber_evidence_finding_idx").on(table.findingId),
  }),
);

// 7. Structured Reports & Exports
export const CyberReportTable = pgTable(
  "cyber_report",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => CyberFindingTable.id, { onDelete: "cascade" }),
    reportFormat: varchar("report_format", { length: 32 })
      .notNull()
      .default("markdown"), // markdown, json, pdf
    compiledPayload: jsonb("compiled_payload").notNull(),
    qualityScore: integer("quality_score").notNull().default(0), // 0-100
    qualityFeedback: jsonb("quality_feedback").default([]),
    exportedAt: timestamp("exported_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    findingReportIdx: index("cyber_report_finding_idx").on(table.findingId),
  }),
);

// 8. Behavioral Audit Events
export const CyberAuditEventTable = pgTable(
  "cyber_audit_event",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => CyberSessionTable.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 64 }).notNull(), // scope_check, scope_breach_prevented, tool_disallowed, finding_verified
    severity: varchar("severity", { length: 16 }).notNull().default("info"), // info, warning, breach
    details: jsonb("details").notNull().default({}),
    timestamp: timestamp("timestamp").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userAuditIdx: index("cyber_audit_user_idx").on(table.userId),
    sessionAuditIdx: index("cyber_audit_session_idx").on(table.sessionId),
    eventAuditIdx: index("cyber_audit_event_type_idx").on(table.eventType),
  }),
);
