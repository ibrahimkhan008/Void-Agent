import { getSession } from "auth/server";
import { createAsanaToolForUser } from "lib/ai/tools/connectors/asana-tool";
import { createClickUpToolForUser } from "lib/ai/tools/connectors/clickup-tool";
import { taskCreationApprovalSchema } from "lib/ai/tools/hitl/task-creation-approval";
import { taskCreationApprovalRepository } from "lib/db/pg/repositories/task-creation-approval-repository.pg";
import { chatRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { getVoiceTranscriptForHandoff } from "lib/voice/handoff";
import { z } from "zod";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("options"),
      messageId: z.string().uuid(),
      provider: z.enum(["asana", "clickup"]),
      parentId: z.string().trim().min(1).max(128).optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["approve", "execute"]),
      messageId: z.string().uuid(),
      provider: z.enum(["asana", "clickup"]),
      parentId: z.string().trim().min(1).max(128),
      targetId: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(500),
      details: z.string().trim().max(20_000),
      approvalToken: z.string().min(40).max(128).optional(),
    })
    .strict(),
]);

type Provider = "asana" | "clickup";
type ListItem = { id: string; name: string };
type ToolResult = Record<string, unknown>;

async function executeUserTool(
  provider: Provider,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const tool =
    provider === "asana"
      ? createAsanaToolForUser(userId)
      : createClickUpToolForUser(userId);
  if (typeof tool.execute !== "function")
    throw new Error("Task connector is unavailable.");
  const execute = tool.execute as unknown as (
    args: Record<string, unknown>,
    options: unknown,
  ) => Promise<unknown>;
  const result = await execute(input, {
    toolCallId: "voice-reviewed-task",
    messages: [],
  });
  return result && typeof result === "object"
    ? (result as ToolResult)
    : { error: "Task connector returned an invalid response." };
}

function asList(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const id = item.gid ?? item.id;
    return typeof id === "string" && typeof item.name === "string"
      ? [{ id, name: item.name.slice(0, 200) }]
      : [];
  });
}

async function loadOptions(
  provider: Provider,
  userId: string,
  parentId?: string,
) {
  if (provider === "asana") {
    const result = await executeUserTool(
      provider,
      userId,
      parentId
        ? { action: "list_projects", workspaceGid: parentId, limit: 100 }
        : { action: "list_workspaces", limit: 100 },
    );
    if (result.error)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Asana is unavailable.",
      );
    return {
      kind: parentId ? "project" : "workspace",
      items: asList(parentId ? result.projects : result.workspaces),
    };
  }
  const result = await executeUserTool(
    provider,
    userId,
    parentId
      ? { action: "list_lists", spaceId: parentId, limit: 100 }
      : { action: "list_spaces", limit: 100 },
  );
  if (result.error)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "ClickUp is unavailable.",
    );
  return {
    kind: parentId ? "list" : "space",
    items: asList(parentId ? result.lists : result.spaces),
  };
}

async function ownedTranscript(userId: string, messageId: string) {
  const message = await chatRepository.selectMessage(messageId);
  if (!message?.threadId) return null;
  const thread = await chatRepository.selectThread(message.threadId);
  return getVoiceTranscriptForHandoff({
    userId,
    requestedUserId: thread?.userId ?? "",
    threadId: message.threadId,
    messageId,
    message,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-reviewed-task",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });
  const body = await readBoundedJson(request, 24_000);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid voice task request" },
      { status: 400, headers: noStore },
    );
  const input = parsed.data;
  try {
    const transcript = await ownedTranscript(session.user.id, input.messageId);
    if (!transcript)
      return Response.json(
        { error: "Owned voice transcript not found" },
        { status: 404, headers: noStore },
      );

    if (input.action === "options") {
      const options = await loadOptions(
        input.provider,
        session.user.id,
        input.parentId,
      );
      return Response.json(options, { headers: noStore });
    }

    // Re-read the current user's live destination list so client-supplied IDs
    // cannot target another workspace, project, or ClickUp list.
    const options = await loadOptions(
      input.provider,
      session.user.id,
      input.parentId,
    );
    if (!options.items.some((item) => item.id === input.targetId)) {
      return Response.json(
        { error: "Choose a current destination from your connected account." },
        { status: 400, headers: noStore },
      );
    }
    const approval = taskCreationApprovalSchema.parse({
      provider: input.provider,
      targetId: input.targetId,
      name: input.name,
      details: input.details,
    });
    if (input.action === "approve") {
      const approvalToken = await taskCreationApprovalRepository.issue(
        session.user.id,
        approval,
      );
      return Response.json({ approvalToken }, { headers: noStore });
    }
    if (!input.approvalToken)
      return Response.json(
        { error: "A current one-use approval is required." },
        { status: 400, headers: noStore },
      );
    // The connector executor consumes the server-issued one-use token against
    // the exact reviewed values; replay or changed fields fail closed.
    const result = await executeUserTool(
      input.provider,
      session.user.id,
      input.provider === "asana"
        ? {
            action: "create_task",
            projectGid: approval.targetId,
            name: approval.name,
            notes: approval.details,
            approvalToken: input.approvalToken,
          }
        : {
            action: "create_task",
            listId: approval.targetId,
            name: approval.name,
            description: approval.details,
            approvalToken: input.approvalToken,
          },
    );
    if (result.error)
      return Response.json(
        { error: String(result.error) },
        { status: 502, headers: noStore },
      );
    return Response.json({ ok: true, result }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Could not process this reviewed voice task." },
      { status: 502, headers: noStore },
    );
  }
}
