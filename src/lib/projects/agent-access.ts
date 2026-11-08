import { eq, or } from "drizzle-orm";
import { AgentTable } from "lib/db/pg/schema.pg";

export function agentAccessFilter(userId: string, teamId: string | null) {
  return teamId
    ? eq(AgentTable.visibility, "public")
    : or(eq(AgentTable.userId, userId), eq(AgentTable.visibility, "public"));
}
