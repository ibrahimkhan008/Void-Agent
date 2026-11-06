import { Agent, AgentRepository, AgentSummary } from "app-types/agent";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import { pgDb as db } from "../db.pg";
import {
  AgentApprovalRequestTable,
  AgentTable,
  BookmarkTable,
  UserTable,
} from "../schema.pg";

export const pgAgentRepository: AgentRepository = {
  async insertAgent(agent) {
    const [result] = await db
      .insert(AgentTable)
      .values({
        id: generateUUID(),
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        userId: agent.userId,
        instructions: agent.instructions,
        visibility: agent.visibility || "private",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    };
  },

  async selectAgentById(id, userId): Promise<Agent | null> {
    const [result] = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        instructions: AgentTable.instructions,
        visibility: AgentTable.visibility,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        isBookmarked: sql<boolean>`${BookmarkTable.id} IS NOT NULL`,
      })
      .from(AgentTable)
      .leftJoin(
        BookmarkTable,
        and(
          eq(BookmarkTable.itemId, AgentTable.id),
          eq(BookmarkTable.userId, userId),
          eq(BookmarkTable.itemType, "agent"),
        ),
      )
      .where(
        and(
          eq(AgentTable.id, id),
          or(
            eq(AgentTable.userId, userId), // Own agent
            eq(AgentTable.visibility, "public"), // Public agent
            eq(AgentTable.visibility, "readonly"), // Readonly agent
          ),
        ),
      );

    if (!result) return null;

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      isBookmarked: result.isBookmarked ?? false,
    };
  },

  async selectAgentsByUserId(userId) {
    const results = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        instructions: AgentTable.instructions,
        visibility: AgentTable.visibility,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        isBookmarked: sql<boolean>`false`,
      })
      .from(AgentTable)
      .innerJoin(UserTable, eq(AgentTable.userId, UserTable.id))
      .where(eq(AgentTable.userId, userId))
      .orderBy(desc(AgentTable.createdAt));

    // Map database nulls to undefined and set defaults for owned agents
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
      isBookmarked: false, // Always false for owned agents
    }));
  },

  async updateAgent(id, userId, agent) {
    const [result] = await db
      .update(AgentTable)
      .set({
        ...agent,
        updatedAt: new Date(),
      })
      .where(
        and(
          // Only allow updates to agents owned by the user or public agents
          eq(AgentTable.id, id),
          or(
            eq(AgentTable.userId, userId),
            eq(AgentTable.visibility, "public"),
          ),
        ),
      )
      .returning();

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    };
  },

  async deleteAgent(id, userId) {
    await db
      .delete(AgentTable)
      .where(and(eq(AgentTable.id, id), eq(AgentTable.userId, userId)));
  },

  async selectAgents(
    currentUserId,
    filters = ["all"],
    limit = 50,
  ): Promise<AgentSummary[]> {
    let orConditions: any[] = [];

    // Build OR conditions based on filters array
    for (const filter of filters) {
      if (filter === "mine") {
        orConditions.push(eq(AgentTable.userId, currentUserId));
      } else if (filter === "shared") {
        orConditions.push(
          and(
            ne(AgentTable.userId, currentUserId),
            or(
              eq(AgentTable.visibility, "public"),
              eq(AgentTable.visibility, "readonly"),
            ),
          ),
        );
      } else if (filter === "bookmarked") {
        orConditions.push(
          and(
            ne(AgentTable.userId, currentUserId),
            or(
              eq(AgentTable.visibility, "public"),
              eq(AgentTable.visibility, "readonly"),
            ),
            sql`${BookmarkTable.id} IS NOT NULL`,
          ),
        );
      } else if (filter === "all") {
        // All available agents (mine + shared) - this overrides other filters
        orConditions = [
          or(
            // My agents
            eq(AgentTable.userId, currentUserId),
            // Shared agents
            and(
              ne(AgentTable.userId, currentUserId),
              or(
                eq(AgentTable.visibility, "public"),
                eq(AgentTable.visibility, "readonly"),
              ),
            ),
          ),
        ];
        break; // "all" overrides everything else
      }
    }

    const results = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        // Exclude instructions from list queries for performance
        visibility: AgentTable.visibility,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        isBookmarked: sql<boolean>`CASE WHEN ${BookmarkTable.id} IS NOT NULL THEN true ELSE false END`,
      })
      .from(AgentTable)
      .innerJoin(UserTable, eq(AgentTable.userId, UserTable.id))
      .leftJoin(
        BookmarkTable,
        and(
          eq(BookmarkTable.itemId, AgentTable.id),
          eq(BookmarkTable.itemType, "agent"),
          eq(BookmarkTable.userId, currentUserId),
        ),
      )
      .where(orConditions.length > 1 ? or(...orConditions) : orConditions[0])
      .orderBy(
        // My agents first, then other shared agents
        sql`CASE WHEN ${AgentTable.userId} = ${currentUserId} THEN 0 ELSE 1 END`,
        desc(AgentTable.createdAt),
      )
      .limit(limit);

    // Map database nulls to undefined
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
    }));
  },

  async checkAccess(agentId, userId, destructive = false) {
    const [agent] = await db
      .select({
        visibility: AgentTable.visibility,
        userId: AgentTable.userId,
      })
      .from(AgentTable)
      .where(eq(AgentTable.id, agentId));
    if (!agent) {
      return false;
    }
    if (userId == agent.userId) return true;
    if (agent.visibility === "public" && !destructive) return true;
    return false;
  },
};

export class AgentApprovalIdempotencyConflictError extends Error {
  constructor() {
    super(
      "The approval request key was already used for different agent data.",
    );
    this.name = "AgentApprovalIdempotencyConflictError";
  }
}

export class AgentApprovalReplayUnavailableError extends Error {
  constructor() {
    super("The agent from this approval was deleted; start a new proposal.");
    this.name = "AgentApprovalReplayUnavailableError";
  }
}

/**
 * Insert a user-approved agent exactly once per user/request key. The unique
 * request index serializes concurrent retries; the payload hash prevents a
 * caller from reusing a key to retrieve an agent created from different data.
 */
export async function insertApprovedAgentIdempotently(
  agent: Parameters<AgentRepository["insertAgent"]>[0],
  requestKey: string,
  requestHash: string,
) {
  const id = generateUUID();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(AgentTable)
      .values({
        id,
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        userId: agent.userId,
        instructions: agent.instructions,
        visibility: agent.visibility || "private",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!inserted) throw new Error("Could not create the approved agent.");

    const [reservation] = await tx
      .insert(AgentApprovalRequestTable)
      .values({ userId: agent.userId, requestKey, requestHash, agentId: id })
      .onConflictDoNothing()
      .returning();

    if (reservation) {
      return {
        agent: {
          ...inserted,
          description: inserted.description ?? undefined,
          icon: inserted.icon ?? undefined,
          instructions: inserted.instructions ?? {},
        },
        replayed: false,
      };
    }

    const [existingRequest] = await tx
      .select()
      .from(AgentApprovalRequestTable)
      .where(
        and(
          eq(AgentApprovalRequestTable.userId, agent.userId),
          eq(AgentApprovalRequestTable.requestKey, requestKey),
        ),
      )
      .for("update");
    if (!existingRequest) {
      throw new Error("Agent approval retry could not be resolved.");
    }

    await tx
      .delete(AgentTable)
      .where(and(eq(AgentTable.id, id), eq(AgentTable.userId, agent.userId)));

    if (existingRequest.requestHash !== requestHash) {
      throw new AgentApprovalIdempotencyConflictError();
    }
    if (!existingRequest.agentId) {
      throw new AgentApprovalReplayUnavailableError();
    }

    const [existing] = await tx
      .select()
      .from(AgentTable)
      .where(
        and(
          eq(AgentTable.userId, agent.userId),
          eq(AgentTable.id, existingRequest.agentId),
        ),
      )
      .for("update");
    if (!existing) throw new Error("The approved agent no longer exists.");

    return {
      agent: {
        ...existing,
        description: existing.description ?? undefined,
        icon: existing.icon ?? undefined,
        instructions: existing.instructions ?? {},
      },
      replayed: true,
    };
  });
}
