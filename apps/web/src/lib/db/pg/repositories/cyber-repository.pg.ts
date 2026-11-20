import "server-only";

import { type SQL, and, desc, eq, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  CyberAgentTable,
  CyberAuditEventTable,
  CyberEvidenceVaultTable,
  CyberFindingTable,
  CyberLearningFileTable,
  CyberProgramScopeTable,
  CyberProgramTable,
  CyberReportTable,
  CyberResearcherProfileTable,
  CyberSessionTable,
} from "../schema.cyber.pg";
import { UserTable } from "../schema.pg";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CyberResearcherWithUser = CyberResearcherProfile & {
  email: string | null;
  name: string | null;
  subscriptionTier: string | null;
};

export type CyberProgramWithCounts = CyberProgram & {
  scopeCount: number;
  inScopeCount: number;
};

// Types derived from tables
export type CyberProgram = typeof CyberProgramTable.$inferSelect;
export type CyberProgramScope = typeof CyberProgramScopeTable.$inferSelect;
export type CyberResearcherProfile =
  typeof CyberResearcherProfileTable.$inferSelect;
export type CyberSession = typeof CyberSessionTable.$inferSelect;
export type CyberFinding = typeof CyberFindingTable.$inferSelect;
export type CyberEvidenceVault = typeof CyberEvidenceVaultTable.$inferSelect;
export type CyberReport = typeof CyberReportTable.$inferSelect;
export type CyberAuditEvent = typeof CyberAuditEventTable.$inferSelect;
export type CyberAgent = typeof CyberAgentTable.$inferSelect;
export type CyberLearningFile = typeof CyberLearningFileTable.$inferSelect;

export const cyberRepository = {
  // --- 1. Target Programs ---
  async createProgram(data: {
    name: string;
    programHandle: string;
    description?: string;
    policyMarkdown?: string;
    hasBounties?: boolean;
    currency?: string;
    rulesMetadata?: Record<string, unknown>;
    createdByUserId: string;
  }): Promise<CyberProgram> {
    const [inserted] = await db
      .insert(CyberProgramTable)
      .values({
        name: data.name,
        programHandle: data.programHandle,
        description: data.description,
        policyMarkdown: data.policyMarkdown,
        hasBounties: data.hasBounties ?? false,
        currency: data.currency ?? "USD",
        rulesMetadata: data.rulesMetadata ?? {},
        createdByUserId: data.createdByUserId,
      })
      .returning();
    return inserted;
  },

  async getProgramById(id: string): Promise<CyberProgram | null> {
    const [program] = await db
      .select()
      .from(CyberProgramTable)
      .where(eq(CyberProgramTable.id, id))
      .limit(1);
    return program || null;
  },

  async getProgramByHandle(handle: string): Promise<CyberProgram | null> {
    const [program] = await db
      .select()
      .from(CyberProgramTable)
      .where(eq(CyberProgramTable.programHandle, handle))
      .limit(1);
    return program || null;
  },

  async listPrograms(options?: {
    limit?: number;
    offset?: number;
  }): Promise<CyberProgram[]> {
    return db
      .select()
      .from(CyberProgramTable)
      .orderBy(desc(CyberProgramTable.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  async listProgramsWithCounts(options?: {
    limit?: number;
    offset?: number;
  }): Promise<CyberProgramWithCounts[]> {
    const programs = await this.listPrograms(options);
    if (programs.length === 0) return [];

    const scopeRows = await db
      .select({
        programId: CyberProgramScopeTable.programId,
        total: sql<number>`count(*)::int`,
        inScope: sql<number>`count(*) filter (where ${CyberProgramScopeTable.isInScope} = true)::int`,
      })
      .from(CyberProgramScopeTable)
      .groupBy(CyberProgramScopeTable.programId);

    const countsMap = new Map(
      scopeRows.map((r) => [
        r.programId,
        { total: r.total, inScope: r.inScope },
      ]),
    );

    return programs.map((p) => {
      const counts = countsMap.get(p.id);
      return {
        ...p,
        scopeCount: counts?.total ?? 0,
        inScopeCount: counts?.inScope ?? 0,
      };
    });
  },

  async updateProgram(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      policyMarkdown: string;
      hasBounties: boolean;
      rulesMetadata: Record<string, unknown>;
    }>,
  ): Promise<CyberProgram | null> {
    const [updated] = await db
      .update(CyberProgramTable)
      .set({
        ...data,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(CyberProgramTable.id, id))
      .returning();
    return updated || null;
  },

  async deleteProgram(id: string): Promise<boolean> {
    const result = await db
      .delete(CyberProgramTable)
      .where(eq(CyberProgramTable.id, id))
      .returning({ id: CyberProgramTable.id });
    return result.length > 0;
  },

  // --- 2. Program Asset Scopes ---
  async addProgramScope(data: {
    programId: string;
    assetIdentifier: string;
    assetType: "url" | "domain" | "wildcard" | "cidr" | "mobile_app";
    isInScope?: boolean;
    maxSeverityAllowed?: string;
    instructionNotes?: string;
  }): Promise<CyberProgramScope> {
    const [inserted] = await db
      .insert(CyberProgramScopeTable)
      .values({
        programId: data.programId,
        assetIdentifier: data.assetIdentifier,
        assetType: data.assetType,
        isInScope: data.isInScope ?? true,
        maxSeverityAllowed: data.maxSeverityAllowed,
        instructionNotes: data.instructionNotes,
      })
      .returning();
    return inserted;
  },

  async listProgramScopes(programId: string): Promise<CyberProgramScope[]> {
    return db
      .select()
      .from(CyberProgramScopeTable)
      .where(eq(CyberProgramScopeTable.programId, programId))
      .orderBy(
        desc(CyberProgramScopeTable.isInScope),
        desc(CyberProgramScopeTable.createdAt),
      );
  },

  async deleteProgramScope(scopeId: string): Promise<boolean> {
    const result = await db
      .delete(CyberProgramScopeTable)
      .where(eq(CyberProgramScopeTable.id, scopeId))
      .returning({ id: CyberProgramScopeTable.id });
    return result.length > 0;
  },

  // --- 3. Researcher Profiles ---
  async getResearcherProfile(
    userId: string,
  ): Promise<CyberResearcherProfile | null> {
    const [profile] = await db
      .select()
      .from(CyberResearcherProfileTable)
      .where(eq(CyberResearcherProfileTable.userId, userId))
      .limit(1);
    return profile || null;
  },

  async upsertResearcherProfile(data: {
    userId: string;
    accessTier?: number;
    role?: string;
    status?: string;
    voidTrustScore?: number;
    mfaEnforced?: boolean;
    maxConcurrentAgents?: number | null;
    maxActiveSessions?: number | null;
    invitedByUserId?: string;
  }): Promise<CyberResearcherProfile> {
    const [upserted] = await db
      .insert(CyberResearcherProfileTable)
      .values({
        userId: data.userId,
        accessTier: data.accessTier ?? 1,
        role: data.role ?? "researcher",
        status: data.status ?? "active",
        voidTrustScore: data.voidTrustScore ?? 500,
        mfaEnforced: data.mfaEnforced ?? false,
        maxConcurrentAgents: data.maxConcurrentAgents ?? null,
        maxActiveSessions: data.maxActiveSessions ?? null,
        invitedByUserId: data.invitedByUserId,
      })
      .onConflictDoUpdate({
        target: CyberResearcherProfileTable.userId,
        set: {
          accessTier:
            data.accessTier !== undefined
              ? data.accessTier
              : sql`${CyberResearcherProfileTable.accessTier}`,
          role: data.role || sql`${CyberResearcherProfileTable.role}`,
          status: data.status || sql`${CyberResearcherProfileTable.status}`,
          voidTrustScore:
            data.voidTrustScore !== undefined
              ? data.voidTrustScore
              : sql`${CyberResearcherProfileTable.voidTrustScore}`,
          mfaEnforced:
            data.mfaEnforced !== undefined
              ? data.mfaEnforced
              : sql`${CyberResearcherProfileTable.mfaEnforced}`,
          maxConcurrentAgents:
            data.maxConcurrentAgents !== undefined
              ? data.maxConcurrentAgents
              : sql`${CyberResearcherProfileTable.maxConcurrentAgents}`,
          maxActiveSessions:
            data.maxActiveSessions !== undefined
              ? data.maxActiveSessions
              : sql`${CyberResearcherProfileTable.maxActiveSessions}`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();
    return upserted;
  },

  async deleteResearcherProfile(userId: string): Promise<boolean> {
    const deleted = await db
      .delete(CyberResearcherProfileTable)
      .where(eq(CyberResearcherProfileTable.userId, userId))
      .returning({ userId: CyberResearcherProfileTable.userId });
    return deleted.length > 0;
  },

  async listResearchers(options?: {
    limit?: number;
    offset?: number;
  }): Promise<CyberResearcherWithUser[]> {
    const rows = await db
      .select({
        profile: CyberResearcherProfileTable,
        email: UserTable.email,
        name: UserTable.name,
        subscriptionTier: UserTable.tier,
      })
      .from(CyberResearcherProfileTable)
      .leftJoin(UserTable, eq(CyberResearcherProfileTable.userId, UserTable.id))
      .orderBy(desc(CyberResearcherProfileTable.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return rows.map((r) => ({
      ...r.profile,
      email: r.email ?? null,
      name: r.name ?? null,
      subscriptionTier: r.subscriptionTier ?? "free",
    }));
  },

  async countActiveSessionsByUser(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(CyberSessionTable)
      .where(
        and(
          eq(CyberSessionTable.userId, userId),
          eq(CyberSessionTable.status, "active"),
        ),
      );
    return row?.count ?? 0;
  },

  // --- 9. Predefined Cyber Agents ---
  async createAgent(data: {
    userId: string;
    name: string;
    description?: string;
    systemPrompt: string;
    skillSlugs?: string[];
    sandboxEnabled?: boolean;
    isShared?: boolean;
  }): Promise<CyberAgent> {
    const [inserted] = await db
      .insert(CyberAgentTable)
      .values({
        userId: data.userId,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        skillSlugs: data.skillSlugs ?? [],
        sandboxEnabled: data.sandboxEnabled ?? true,
        isShared: data.isShared ?? false,
      })
      .returning();
    return inserted;
  },

  async getAgentById(id: string): Promise<CyberAgent | null> {
    const [agent] = await db
      .select()
      .from(CyberAgentTable)
      .where(eq(CyberAgentTable.id, id))
      .limit(1);
    return agent || null;
  },

  async listAgentsForUser(userId: string): Promise<CyberAgent[]> {
    return db
      .select()
      .from(CyberAgentTable)
      .where(
        or(
          eq(CyberAgentTable.userId, userId),
          eq(CyberAgentTable.isShared, true),
        ),
      )
      .orderBy(desc(CyberAgentTable.createdAt));
  },

  async updateAgent(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      systemPrompt: string;
      skillSlugs: string[];
      sandboxEnabled: boolean;
      isShared: boolean;
    }>,
  ): Promise<CyberAgent | null> {
    const [updated] = await db
      .update(CyberAgentTable)
      .set({
        ...data,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(CyberAgentTable.id, id))
      .returning();
    return updated || null;
  },

  async deleteAgent(id: string): Promise<boolean> {
    const deleted = await db
      .delete(CyberAgentTable)
      .where(eq(CyberAgentTable.id, id))
      .returning({ id: CyberAgentTable.id });
    return deleted.length > 0;
  },

  async findUserByEmailOrId(
    identifier: string,
  ): Promise<{ id: string; email: string; name: string } | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    if (UUID_REGEX.test(trimmed)) {
      const [user] = await db
        .select({
          id: UserTable.id,
          email: UserTable.email,
          name: UserTable.name,
        })
        .from(UserTable)
        .where(eq(UserTable.id, trimmed))
        .limit(1);
      return user ?? null;
    }

    const [user] = await db
      .select({
        id: UserTable.id,
        email: UserTable.email,
        name: UserTable.name,
      })
      .from(UserTable)
      .where(eq(UserTable.email, trimmed.toLowerCase()))
      .limit(1);
    return user ?? null;
  },

  // --- 4. Research Sessions ---
  async createSession(data: {
    userId: string;
    programId: string;
    title: string;
    status?: string;
    sandboxId?: string;
    sandboxProxyToken?: string;
    assignedAgents?: string[];
  }): Promise<CyberSession> {
    const [inserted] = await db
      .insert(CyberSessionTable)
      .values({
        userId: data.userId,
        programId: data.programId,
        title: data.title,
        status: data.status ?? "active",
        sandboxId: data.sandboxId,
        sandboxProxyToken: data.sandboxProxyToken,
        assignedAgents: data.assignedAgents ?? [],
      })
      .returning();
    return inserted;
  },

  async getSessionById(id: string): Promise<CyberSession | null> {
    const [session] = await db
      .select()
      .from(CyberSessionTable)
      .where(eq(CyberSessionTable.id, id))
      .limit(1);
    return session || null;
  },

  async listSessionsByUser(
    userId: string,
    limit = 20,
  ): Promise<CyberSession[]> {
    return db
      .select()
      .from(CyberSessionTable)
      .where(eq(CyberSessionTable.userId, userId))
      .orderBy(desc(CyberSessionTable.createdAt))
      .limit(limit);
  },

  async listSessionsByProgram(
    programId: string,
    limit = 50,
  ): Promise<CyberSession[]> {
    return db
      .select()
      .from(CyberSessionTable)
      .where(eq(CyberSessionTable.programId, programId))
      .orderBy(desc(CyberSessionTable.createdAt))
      .limit(limit);
  },

  async updateSessionStatus(
    id: string,
    status: string,
  ): Promise<CyberSession | null> {
    const [updated] = await db
      .update(CyberSessionTable)
      .set({
        status,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(CyberSessionTable.id, id))
      .returning();
    return updated || null;
  },

  // --- 5. Security Findings ---
  async createFinding(data: {
    sessionId?: string | null;
    userId: string;
    title: string;
    cweId?: string;
    cvssScore?: string;
    severity: string;
    affectedAsset: string;
    status?: string;
    reproductionSteps: string;
    proofOfConcept: string;
    impactDescription: string;
    remediationGuidance?: string;
    rawToolOutputs?: Record<string, unknown>;
    verificationLog?: string;
  }): Promise<CyberFinding> {
    const [inserted] = await db
      .insert(CyberFindingTable)
      .values({
        sessionId: data.sessionId ?? null,
        userId: data.userId,
        title: data.title,
        cweId: data.cweId,
        cvssScore: data.cvssScore,
        severity: data.severity,
        affectedAsset: data.affectedAsset,
        status: data.status ?? "candidate",
        reproductionSteps: data.reproductionSteps,
        proofOfConcept: data.proofOfConcept,
        impactDescription: data.impactDescription,
        remediationGuidance: data.remediationGuidance,
        rawToolOutputs: data.rawToolOutputs ?? {},
        verificationLog: data.verificationLog,
      })
      .returning();
    return inserted;
  },

  async getFindingById(id: string): Promise<CyberFinding | null> {
    const [finding] = await db
      .select()
      .from(CyberFindingTable)
      .where(eq(CyberFindingTable.id, id))
      .limit(1);
    return finding || null;
  },

  async listFindingsBySession(
    sessionId: string,
    limit = 100,
  ): Promise<CyberFinding[]> {
    return db
      .select()
      .from(CyberFindingTable)
      .where(eq(CyberFindingTable.sessionId, sessionId))
      .orderBy(desc(CyberFindingTable.createdAt))
      .limit(limit);
  },

  async listFindingsByUser(
    userId: string,
    limit = 50,
  ): Promise<CyberFinding[]> {
    return db
      .select()
      .from(CyberFindingTable)
      .where(eq(CyberFindingTable.userId, userId))
      .orderBy(desc(CyberFindingTable.createdAt))
      .limit(limit);
  },

  async updateFinding(
    id: string,
    data: Partial<{
      status: string;
      verificationLog: string;
      severity: string;
      cvssScore: string;
      remediationGuidance: string;
    }>,
  ): Promise<CyberFinding | null> {
    const [updated] = await db
      .update(CyberFindingTable)
      .set({
        ...data,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(CyberFindingTable.id, id))
      .returning();
    return updated || null;
  },

  // --- 6. Evidence Vault ---
  async addEvidence(data: {
    findingId: string;
    evidenceType: string;
    sha256Hash: string;
    payloadBytes: string;
  }): Promise<CyberEvidenceVault> {
    const [inserted] = await db
      .insert(CyberEvidenceVaultTable)
      .values({
        findingId: data.findingId,
        evidenceType: data.evidenceType,
        sha256Hash: data.sha256Hash,
        payloadBytes: data.payloadBytes,
      })
      .returning();
    return inserted;
  },

  async listEvidenceByFinding(
    findingId: string,
  ): Promise<CyberEvidenceVault[]> {
    return db
      .select()
      .from(CyberEvidenceVaultTable)
      .where(eq(CyberEvidenceVaultTable.findingId, findingId))
      .orderBy(desc(CyberEvidenceVaultTable.capturedAt));
  },

  // --- 7. Reports ---
  async createReport(data: {
    findingId: string;
    reportFormat: string;
    compiledPayload: Record<string, unknown>;
    qualityScore?: number;
    qualityFeedback?: unknown[];
  }): Promise<CyberReport> {
    const [inserted] = await db
      .insert(CyberReportTable)
      .values({
        findingId: data.findingId,
        reportFormat: data.reportFormat,
        compiledPayload: data.compiledPayload,
        qualityScore: data.qualityScore ?? 0,
        qualityFeedback: data.qualityFeedback ?? [],
      })
      .returning();
    return inserted;
  },

  async getReportById(id: string): Promise<CyberReport | null> {
    const [report] = await db
      .select()
      .from(CyberReportTable)
      .where(eq(CyberReportTable.id, id))
      .limit(1);
    return report || null;
  },

  async listReportsByFinding(findingId: string): Promise<CyberReport[]> {
    return db
      .select()
      .from(CyberReportTable)
      .where(eq(CyberReportTable.findingId, findingId))
      .orderBy(desc(CyberReportTable.createdAt));
  },

  async markReportExported(id: string): Promise<CyberReport | null> {
    const [updated] = await db
      .update(CyberReportTable)
      .set({ exportedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(CyberReportTable.id, id))
      .returning();
    return updated || null;
  },

  // --- 8. Behavioral Audit Events ---
  async logAuditEvent(data: {
    userId: string;
    sessionId?: string;
    eventType: string;
    severity?: string;
    details?: Record<string, unknown>;
  }): Promise<CyberAuditEvent> {
    const [inserted] = await db
      .insert(CyberAuditEventTable)
      .values({
        userId: data.userId,
        sessionId: data.sessionId,
        eventType: data.eventType,
        severity: data.severity ?? "info",
        details: data.details ?? {},
      })
      .returning();
    return inserted;
  },

  async listAuditEvents(options?: {
    userId?: string;
    sessionId?: string;
    limit?: number;
  }): Promise<CyberAuditEvent[]> {
    const conditions: SQL[] = [];
    if (options?.userId) {
      conditions.push(eq(CyberAuditEventTable.userId, options.userId));
    }
    if (options?.sessionId) {
      conditions.push(eq(CyberAuditEventTable.sessionId, options.sessionId));
    }

    const query = db
      .select()
      .from(CyberAuditEventTable)
      .orderBy(desc(CyberAuditEventTable.timestamp))
      .limit(options?.limit ?? 100);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  },

  // --- 10. Bug Bounty Agent Self-Learning Playbook Files ---
  async getLearningFile(
    userId: string,
    filename = "bugbounty-self-learning.md",
  ): Promise<CyberLearningFile | null> {
    const [row] = await db
      .select()
      .from(CyberLearningFileTable)
      .where(
        and(
          eq(CyberLearningFileTable.userId, userId),
          eq(CyberLearningFileTable.filename, filename),
        ),
      )
      .limit(1);
    return row || null;
  },

  async upsertLearningFile(data: {
    userId: string;
    filename?: string;
    contentMarkdown: string;
    entriesCount: number;
    lastLearnedSummary?: string | null;
    agentId?: string | null;
  }): Promise<CyberLearningFile> {
    const filename = data.filename ?? "bugbounty-self-learning.md";
    const existing = await this.getLearningFile(data.userId, filename);
    if (existing) {
      const [updated] = await db
        .update(CyberLearningFileTable)
        .set({
          contentMarkdown: data.contentMarkdown,
          entriesCount: data.entriesCount,
          lastLearnedSummary:
            data.lastLearnedSummary !== undefined
              ? data.lastLearnedSummary
              : existing.lastLearnedSummary,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(CyberLearningFileTable.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await db
      .insert(CyberLearningFileTable)
      .values({
        userId: data.userId,
        agentId: data.agentId ?? null,
        filename,
        contentMarkdown: data.contentMarkdown,
        entriesCount: data.entriesCount,
        lastLearnedSummary: data.lastLearnedSummary ?? null,
      })
      .returning();
    return inserted;
  },
};
