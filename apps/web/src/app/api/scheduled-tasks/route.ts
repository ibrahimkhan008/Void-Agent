import { pgDb } from "@/lib/db/pg/db.pg";
import { AgentTable, ScheduledTaskTable } from "@/lib/db/pg/schema.pg";
import { agentRepository } from "@/lib/db/repository";
import { sanitizeCredentialAliases } from "@/lib/scheduled-tasks/browser-grants";
import { listScheduledTasksForUser } from "@/lib/scheduled-tasks/list-tasks";
import {
  ScheduledTaskCreateSchema,
  computeNextRunAt,
  isValidCron,
} from "@/lib/scheduled-tasks/schedule-validation";
import { withAuth } from "auth/route-guard";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/scheduled-tasks — owner-scoped schedules for the current user. */
export const GET = withAuth(async (request, session) => {
  try {
    const agentId = new URL(request.url).searchParams.get("agentId");
    const tasks = await listScheduledTasksForUser(session.user.id, { agentId });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching scheduled tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheduled tasks" },
      { status: 500 },
    );
  }
});

/** POST /api/scheduled-tasks — create a user-owned scheduled run. */
export const POST = withAuth(async (request, session) => {
  try {
    const parsed = ScheduledTaskCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid scheduled task payload" },
        { status: 400 },
      );
    }
    const {
      executionMode,
      agentId,
      key,
      name,
      description,
      cronExpression,
      timezone,
      inputPrompt,
      browserAutomationEnabled,
      browserCredentialAliases,
      enabled,
    } = parsed.data;

    if (!isValidCron(cronExpression, timezone)) {
      return NextResponse.json(
        { error: "Invalid cron expression or timezone" },
        { status: 400 },
      );
    }
    if (executionMode === "cloud-agent" && !process.env.E2B_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Cloud Agent schedules require E2B to be configured." },
        { status: 503 },
      );
    }

    const activeOrganizationId = (
      session.session as { activeOrganizationId?: string | null } | undefined
    )?.activeOrganizationId;
    let agentName: string | null = null;
    if (agentId) {
      const hasAccess = await agentRepository.checkAccess(
        agentId,
        session.user.id,
        false,
        activeOrganizationId,
      );
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Agent not found or access denied" },
          { status: 404 },
        );
      }
      const [agent] = await pgDb
        .select({ name: AgentTable.name })
        .from(AgentTable)
        .where(eq(AgentTable.id, agentId))
        .limit(1);
      agentName = agent?.name ?? null;
    }

    // Browser grants are separately authorized capabilities. They never
    // follow from choosing the Cloud Agent code sandbox mode.
    const grantedAliases =
      executionMode === "agent"
        ? await sanitizeCredentialAliases({
            organizationId: activeOrganizationId,
            aliases: browserCredentialAliases,
          })
        : [];

    const values = {
      userId: session.user.id,
      taskType: "agent" as const,
      executionMode,
      agentId: agentId ?? null,
      key,
      name:
        name ||
        (agentId
          ? `Scheduled ${agentName ?? "agent"}`
          : executionMode === "cloud-agent"
            ? "Cloud Agent schedule"
            : "Chat AI schedule"),
      description: description || null,
      cronExpression,
      timezone,
      inputPrompt: inputPrompt || null,
      browserAutomationEnabled:
        executionMode === "agent" ? (browserAutomationEnabled ?? false) : false,
      browserCredentialAliases: grantedAliases,
      enabled,
      nextRunAt: computeNextRunAt(cronExpression, timezone),
    };

    let task: typeof ScheduledTaskTable.$inferSelect | undefined;
    if (executionMode === "agent") {
      [task] = await pgDb
        .insert(ScheduledTaskTable)
        .values(values)
        .onConflictDoUpdate({
          target: [ScheduledTaskTable.agentId, ScheduledTaskTable.key],
          set: {
            executionMode,
            name: values.name,
            description: values.description,
            cronExpression,
            timezone,
            inputPrompt: values.inputPrompt,
            ...(browserAutomationEnabled === undefined
              ? {}
              : { browserAutomationEnabled }),
            ...(grantedAliases === null
              ? {}
              : { browserCredentialAliases: grantedAliases }),
            enabled,
            nextRunAt: computeNextRunAt(cronExpression, timezone),
            updatedAt: new Date(),
          },
        })
        .returning();
    } else {
      [task] = await pgDb
        .insert(ScheduledTaskTable)
        .values(values)
        .onConflictDoNothing()
        .returning();
      if (!task) {
        [task] = await pgDb
          .select()
          .from(ScheduledTaskTable)
          .where(
            and(
              eq(ScheduledTaskTable.userId, session.user.id),
              eq(ScheduledTaskTable.key, key),
              agentId
                ? eq(ScheduledTaskTable.agentId, agentId)
                : isNull(ScheduledTaskTable.agentId),
            ),
          )
          .limit(1);
      }
    }

    if (!task) throw new Error("Schedule could not be saved");
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error creating scheduled task:", error);
    return NextResponse.json(
      { error: "Failed to create scheduled task" },
      { status: 500 },
    );
  }
});
