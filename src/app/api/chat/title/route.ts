import { smoothStream, streamText } from "ai";

import { ChatModel } from "app-types/chat";
import { isFreeTier } from "app-types/subscription";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { customModelProvider } from "lib/ai/models";
import { CREATE_THREAD_TITLE_PROMPT } from "lib/ai/prompts";
import {
  TeamBudgetAuthorizationError,
  TeamBudgetExceededError,
  TeamBudgetPolicyError,
} from "lib/ai/team-member-ai-budget";
import {
  TeamBudgetCurrencyMismatchError,
  TeamBudgetModelUnpricedError,
} from "lib/ai/team-member-ai-budget-gate";
import {
  type TeamBudgetLease,
  reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest,
} from "lib/ai/team-member-ai-budget-runtime";
import { chatRepository, userRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { getProjectAccess } from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { getFreeTierLimitCheck } from "lib/rate-limit/free-tier-usage";
import globalLogger from "logger";
import { handleError } from "../shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Title API: `),
});

const MAX_TITLE_REQUEST_BYTES = 16 * 1024;
const MAX_TITLE_MESSAGE_CHARS = 8_000;
const MAX_TITLE_THREAD_ID_CHARS = 256;
const MAX_TITLE_MODEL_FIELD_CHARS = 160;

function isTitleRequest(value: unknown): value is {
  chatModel?: ChatModel;
  message?: string;
  threadId: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (
    body.message !== undefined &&
    (typeof body.message !== "string" ||
      body.message.length > MAX_TITLE_MESSAGE_CHARS)
  )
    return false;
  if (
    typeof body.threadId !== "string" ||
    body.threadId.length === 0 ||
    body.threadId.length > MAX_TITLE_THREAD_ID_CHARS
  )
    return false;
  if (body.chatModel !== undefined) {
    if (
      !body.chatModel ||
      typeof body.chatModel !== "object" ||
      Array.isArray(body.chatModel)
    )
      return false;
    const model = body.chatModel as Record<string, unknown>;
    if (
      typeof model.provider !== "string" ||
      model.provider.length === 0 ||
      model.provider.length > MAX_TITLE_MODEL_FIELD_CHARS ||
      typeof model.model !== "string" ||
      model.model.length === 0 ||
      model.model.length > MAX_TITLE_MODEL_FIELD_CHARS
    )
      return false;
  }
  return true;
}

export async function POST(request: Request) {
  let teamBudgetLease: TeamBudgetLease | undefined;
  let budgetSettled = false;
  const settleBudget = async (input: {
    aborted?: boolean;
    usage?: unknown;
  }) => {
    if (!teamBudgetLease || budgetSettled) return;
    budgetSettled = true;
    await settleTeamBudgetForAiRequest(teamBudgetLease, input);
    teamBudgetLease = undefined;
  };

  try {
    const parsed = await readBoundedJsonRequest(
      request,
      MAX_TITLE_REQUEST_BYTES,
    );
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: parsed.status });
    }
    if (!isTitleRequest(parsed.value)) {
      return Response.json({ error: "Invalid title request" }, { status: 400 });
    }

    const { chatModel, message = "hello", threadId } = parsed.value;

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Abuse controls: this endpoint streams real completions, so apply the
    // same per-user RPM and free-tier daily-token gate as /api/chat.
    const [user, rate] = await Promise.all([
      userRepository.getUserById(session.user.id),
      checkApiRateLimit({
        kind: "chat-user",
        id: session.user.id,
        limit: 30,
        windowMs: 60_000,
      }),
    ]);
    if (!rate.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "retry-after": String(
            Math.max(1, Math.ceil(rate.retryAfterMs / 1000)),
          ),
        },
      });
    }
    if (isFreeTier(user?.tier)) {
      const usageCheck = await getFreeTierLimitCheck(session.user.id);
      if (!usageCheck.allowed) {
        return new Response("Daily free-tier token limit reached", {
          status: 429,
        });
      }
    }

    // Only use a persisted, owner-authorized thread to determine whether this
    // request belongs to a team. A client-supplied org/team ID is never billing
    // authority; a fresh thread has no trusted team scope yet.
    let trustedTeamId: string | undefined;
    if (
      typeof threadId === "string" &&
      threadId.length > 0 &&
      !(await chatRepository.checkAccess(threadId, session.user.id))
    ) {
      const exists = await chatRepository.selectThreadDetails(threadId);
      if (exists) {
        return new Response("Not found", { status: 404 });
      }
    } else if (typeof threadId === "string" && threadId.length > 0) {
      const thread = await chatRepository.selectThreadDetails(threadId);
      if (thread?.userId === session.user.id) {
        trustedTeamId = thread.orgId ?? undefined;
        if (thread.projectId) {
          const access = await getProjectAccess(
            thread.projectId,
            session.user.id,
          );
          trustedTeamId = access?.project.teamId ?? trustedTeamId;
        }
      }
    }

    logger.info(
      `chatModel: ${chatModel?.provider}/${chatModel?.model}, threadId: ${threadId}`,
    );

    try {
      teamBudgetLease = await reserveTeamBudgetForAiRequest({
        teamId: trustedTeamId,
        userId: session.user.id,
        model: chatModel,
        promptCharacters: JSON.stringify({
          system: CREATE_THREAD_TITLE_PROMPT,
          prompt: message,
        }).length,
        idempotencyScope: "chat-title",
      });
    } catch (error) {
      if (error instanceof TeamBudgetExceededError) {
        return Response.json(
          { code: "team-member-budget-exceeded", message: error.message },
          { status: 402 },
        );
      }
      if (error instanceof TeamBudgetAuthorizationError) {
        return new Response("Forbidden", { status: 403 });
      }
      if (
        error instanceof TeamBudgetModelUnpricedError ||
        error instanceof TeamBudgetCurrencyMismatchError ||
        error instanceof TeamBudgetPolicyError
      ) {
        return Response.json(
          {
            code: "team-budget-unavailable",
            message: "The team AI budget could not be verified for this model.",
          },
          { status: 503 },
        );
      }
      logger.error(
        "Could not reserve team AI budget for title generation",
        error,
      );
      return Response.json(
        {
          code: "team-budget-unavailable",
          message:
            "The team AI budget could not be reserved. Try again shortly.",
        },
        { status: 503 },
      );
    }

    const result = streamText({
      model: teamBudgetLease
        ? await customModelProvider.getModelAsync(chatModel)
        : await customModelProvider.getModelWithFailureFallbackAsync(chatModel),
      system: CREATE_THREAD_TITLE_PROMPT,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: message,
      abortSignal: request.signal,
      onAbort: async () => {
        await settleBudget({ aborted: true }).catch((error) =>
          logger.error("Could not release title budget reservation", error),
        );
      },
      onError: async () => {
        await settleBudget({ aborted: true }).catch((error) =>
          logger.error("Could not release title budget reservation", error),
        );
      },
      onFinish: async (ctx) => {
        await settleBudget({ usage: ctx.totalUsage }).catch((error) =>
          logger.error("Could not finalize title budget reservation", error),
        );
        chatRepository
          .upsertThread({
            id: threadId,
            title: ctx.text,
            userId: session.user.id,
          })
          .catch((err) => logger.error(err));
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (teamBudgetLease && !budgetSettled) {
      await settleBudget({ aborted: true }).catch((releaseError) =>
        logger.error(
          "Could not release title budget reservation",
          releaseError,
        ),
      );
    }
    return new Response(handleError(err), { status: 500 });
  }
}
