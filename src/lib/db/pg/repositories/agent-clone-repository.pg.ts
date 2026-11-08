import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { AgentTable } from "lib/db/pg/schema.pg";

const COPY_SUFFIX = " (Copy)";
const CLONE_PRESET_PREFIX = "gallery-copy:";

function cloneName(name: string) {
  return `${name.slice(0, 100 - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

function safeInstructions(instructions: unknown): {
  role?: string;
  systemPrompt?: string;
} {
  if (!instructions || typeof instructions !== "object") return {};
  const source = instructions as Record<string, unknown>;
  return {
    ...(typeof source.role === "string" ? { role: source.role } : {}),
    ...(typeof source.systemPrompt === "string"
      ? { systemPrompt: source.systemPrompt }
      : {}),
  };
}

function safeIcon(icon: unknown) {
  if (!icon || typeof icon !== "object") return null;
  const candidate = icon as Record<string, unknown>;
  return candidate.type === "emoji" && typeof candidate.value === "string"
    ? { type: "emoji" as const, value: candidate.value.slice(0, 32) }
    : null;
}

/** Create one private user-owned copy from a currently published shared agent. */
export async function clonePublishedAgentForUser(
  sourceAgentId: string,
  userId: string,
): Promise<{ agentId: string; created: boolean } | null> {
  return pgDb.transaction(async (tx) => {
    // Lock and recheck publication in the same transaction as the copy so an
    // unpublish/private transition cannot race the clone authorization.
    const [source] = await tx
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        instructions: AgentTable.instructions,
      })
      .from(AgentTable)
      .where(
        and(
          eq(AgentTable.id, sourceAgentId),
          isNotNull(AgentTable.publishedAt),
          inArray(AgentTable.visibility, ["public", "readonly"]),
        ),
      )
      .for("share")
      .limit(1);

    if (!source) return null;

    const presetId = `${CLONE_PRESET_PREFIX}${source.id}`;
    const [created] = await tx
      .insert(AgentTable)
      .values({
        userId,
        presetId,
        name: cloneName(source.name),
        description: source.description?.slice(0, 8_000) ?? null,
        icon: safeIcon(source.icon),
        // Deliberately omit model pins, MCP/agent mentions and file bindings:
        // those can reference the publisher's private integrations or storage.
        instructions: safeInstructions(source.instructions),
        visibility: "private",
        publishedAt: null,
        galleryMetadata: null,
        coverImageUrl: null,
        installCount: 0,
      })
      .onConflictDoNothing()
      .returning({ id: AgentTable.id });

    if (created) return { agentId: created.id, created: true };

    // presetId is uniquely scoped to this user by the existing partial unique
    // index; resolving the conflict makes repeated requests idempotent.
    const [existing] = await tx
      .select({ id: AgentTable.id })
      .from(AgentTable)
      .where(
        and(eq(AgentTable.userId, userId), eq(AgentTable.presetId, presetId)),
      )
      .limit(1);
    if (!existing) throw new Error("Could not create or locate agent copy");
    return { agentId: existing.id, created: false };
  });
}
