import { pgDb } from "@/lib/db/pg/db.pg";
import { ScheduledTaskTable } from "@/lib/db/pg/schema.pg";
import { agentRepository } from "@/lib/db/repository";
import { sanitizeCredentialAliases } from "@/lib/scheduled-tasks/browser-grants";
import {
  ScheduledTaskUpdateSchema,
  computeNextRunAt,
  isValidCron,
} from "@/lib/scheduled-tasks/schedule-validation";
import { withAuth } from "auth/route-guard";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/scheduled-tasks/[id]
 * Get a specific scheduled task
 */
export const GET = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id } = await params;

      const [task] = await pgDb
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(
            eq(ScheduledTaskTable.id, id),
            eq(ScheduledTaskTable.userId, session.user.id),
          ),
        )
        .limit(1);

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      return NextResponse.json({ task });
    } catch (error) {
      console.error("Error fetching scheduled task:", error);
      return NextResponse.json(
        { error: "Failed to fetch scheduled task" },
        { status: 500 },
      );
    }
  },
);

/**
 * PATCH /api/scheduled-tasks/[id]
 * Update a scheduled task
 */
export const PATCH = withAuth(
  async (request, session, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();

      const parsed = ScheduledTaskUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid scheduled task payload" },
          { status: 400 },
        );
      }
      const {
        executionMode,
        agentId,
        name,
        description,
        cronExpression,
        timezone,
        inputPrompt,
        model,
        browserAutomationEnabled,
        browserCredentialAliases,
        enabled,
      } = parsed.data;

      // Verify task exists and user owns it
      const [existingTask] = await pgDb
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(
            eq(ScheduledTaskTable.id, id),
            eq(ScheduledTaskTable.userId, session.user.id),
          ),
        )
        .limit(1);

      if (!existingTask) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const effectiveMode = executionMode ?? existingTask.executionMode;
      const effectiveAgentId =
        agentId === undefined ? existingTask.agentId : agentId;
      if (effectiveMode === "agent" && !effectiveAgentId) {
        return NextResponse.json(
          { error: "Custom Agent mode requires an agent" },
          { status: 400 },
        );
      }
      if (
        effectiveMode === "cloud-agent" &&
        (executionMode !== undefined || enabled === true) &&
        !process.env.E2B_API_KEY?.trim()
      ) {
        return NextResponse.json(
          { error: "Cloud Agent schedules require E2B to be configured" },
          { status: 503 },
        );
      }
      const activeOrganizationId = (
        session.session as { activeOrganizationId?: string | null } | undefined
      )?.activeOrganizationId;
      if (
        effectiveAgentId &&
        (agentId !== undefined || executionMode !== undefined) &&
        !(await agentRepository.checkAccess(
          effectiveAgentId,
          session.user.id,
          false,
          activeOrganizationId,
        ))
      ) {
        return NextResponse.json(
          { error: "Agent not found or access denied" },
          { status: 404 },
        );
      }

      // Validate the effective cron/timezone pair after this update.
      const effectiveCron = cronExpression ?? existingTask.cronExpression;
      const effectiveTimezone = timezone ?? existingTask.timezone;
      if (
        (cronExpression !== undefined || timezone !== undefined) &&
        !isValidCron(effectiveCron, effectiveTimezone)
      ) {
        return NextResponse.json(
          { error: "Invalid cron expression or timezone" },
          { status: 400 },
        );
      }

      // Recompute the persisted next occurrence whenever the schedule timing
      // changes (or the task is (re-)enabled), so the checker's next_run_at
      // filter stays accurate. Disabling clears it.
      const timingChanged =
        cronExpression !== undefined ||
        timezone !== undefined ||
        enabled !== undefined;
      const effectiveEnabled = enabled ?? existingTask.enabled;
      const nextRunAt = timingChanged
        ? effectiveEnabled
          ? computeNextRunAt(effectiveCron, effectiveTimezone)
          : null
        : undefined;

      // Aliases name a capability, so they are checked against the caller's
      // organization rather than taken from the client.
      const grantedAliases =
        effectiveMode === "agent"
          ? await sanitizeCredentialAliases({
              organizationId: activeOrganizationId,
              aliases: browserCredentialAliases,
            })
          : [];

      // Update task
      const [updatedTask] = await pgDb
        .update(ScheduledTaskTable)
        .set({
          ...(executionMode !== undefined && { executionMode }),
          ...(agentId !== undefined && { agentId }),
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(cronExpression !== undefined && { cronExpression }),
          ...(timezone !== undefined && { timezone }),
          ...(inputPrompt !== undefined && { inputPrompt }),
          // nullish explicitly (null clears a pinned model back to Automatic),
          // undefined leaves it untouched.
          ...(model !== undefined && { model: model || null }),
          ...(effectiveMode !== "agent"
            ? { browserAutomationEnabled: false }
            : browserAutomationEnabled !== undefined
              ? { browserAutomationEnabled }
              : {}),
          ...(grantedAliases !== null && {
            browserCredentialAliases: grantedAliases,
          }),
          ...(enabled !== undefined && { enabled }),
          ...(nextRunAt !== undefined && { nextRunAt }),
          updatedAt: new Date(),
        })
        .where(eq(ScheduledTaskTable.id, id))
        .returning();

      return NextResponse.json({ task: updatedTask });
    } catch (error) {
      console.error("Error updating scheduled task:", error);
      return NextResponse.json(
        { error: "Failed to update scheduled task" },
        { status: 500 },
      );
    }
  },
);

/**
 * DELETE /api/scheduled-tasks/[id]
 * Delete a scheduled task
 */
export const DELETE = withAuth(
  async (
    _request,
    session,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id } = await params;

      // Verify task exists and user owns it
      const [existingTask] = await pgDb
        .select()
        .from(ScheduledTaskTable)
        .where(
          and(
            eq(ScheduledTaskTable.id, id),
            eq(ScheduledTaskTable.userId, session.user.id),
          ),
        )
        .limit(1);

      if (!existingTask) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      // Delete task
      await pgDb
        .delete(ScheduledTaskTable)
        .where(eq(ScheduledTaskTable.id, id));

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error deleting scheduled task:", error);
      return NextResponse.json(
        { error: "Failed to delete scheduled task" },
        { status: 500 },
      );
    }
  },
);
