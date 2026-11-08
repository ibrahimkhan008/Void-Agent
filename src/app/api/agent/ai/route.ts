import { streamObject } from "ai";

import { customModelProvider } from "lib/ai/models";
import { buildAgentGenerationPrompt } from "lib/ai/prompts";
import globalLogger from "logger";

import { AgentGenerateSchema } from "app-types/agent";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { getUnconnectedAgentGenerationApps } from "lib/ai/agent/generation-apps";
import {
  isComposioConfigured,
  listComposioAccountsForUser,
  listComposioToolkits,
} from "lib/ai/composio";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
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
import { teamRepository, workflowRepository } from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { objectFlow } from "lib/utils";
import { safe } from "ts-safe";
import { z } from "zod";
import { loadAppDefaultTools } from "../../chat/shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent Generate API: `),
});

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_PROMPT_CHARS = 8_000;
const MAX_MODEL_FIELD_CHARS = 160;
const AgentGenerationRequestSchema = z
  .object({
    chatModel: z
      .object({
        provider: z.string().min(1).max(MAX_MODEL_FIELD_CHARS),
        model: z.string().min(1).max(MAX_MODEL_FIELD_CHARS),
      })
      .strict()
      .optional(),
    message: z.string().max(MAX_PROMPT_CHARS).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let teamBudgetLease: TeamBudgetLease | undefined;
  let budgetSettled = false;
  const settleBudget = async (input: {
    aborted?: boolean;
    usage?: unknown;
  }) => {
    if (!teamBudgetLease || budgetSettled) return;
    // Mark before the async repository call so a second callback/catch cannot
    // release a lease after a completed provider response failed to settle.
    budgetSettled = true;
    await settleTeamBudgetForAiRequest(teamBudgetLease, input);
    teamBudgetLease = undefined;
  };

  try {
    const session = await getSession({ disableCookieCache: true });
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rate = await checkApiRateLimit({
      kind: "agent-generate-user",
      id: session.user.id,
      limit: 10,
      windowMs: 60_000,
    });
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

    const bounded = await readBoundedJsonRequest(request, MAX_REQUEST_BYTES);
    if (!bounded.ok) {
      return Response.json(
        { error: bounded.error },
        { status: bounded.status },
      );
    }
    const parsed = AgentGenerationRequestSchema.safeParse(bounded.value);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid agent generation request" },
        { status: 400 },
      );
    }
    const { chatModel, message = "hello" } = parsed.data;

    // Active team context is app-owned session state, not request input or a
    // Better Auth organization-plugin field. Revalidate membership on use.
    const activeTeamId = session.session.activeTeamId;
    const teamId = activeTeamId || undefined;
    if (teamId) {
      const member = await teamRepository.getTeamMember(
        teamId,
        session.user.id,
      );
      if (!member) return new Response("Forbidden", { status: 403 });
    }

    logger.info(`chatModel: ${chatModel?.provider}/${chatModel?.model}`);

    const toolNames = new Set<string>();

    await safe(loadAppDefaultTools)

      .ifOk((appTools) => {
        objectFlow(appTools).forEach((_, toolName) => {
          toolNames.add(toolName);
        });
      })
      .unwrap();

    await safe(mcpClientsManager.tools())
      .ifOk((tools) => {
        objectFlow(tools).forEach((mcp) => {
          toolNames.add(mcp._originToolName);
        });
      })
      .unwrap();

    await safe(workflowRepository.selectExecuteAbility(session.user.id))
      .ifOk((tools) => {
        tools.forEach((tool) => {
          toolNames.add(tool.name);
        });
      })
      .unwrap();

    const dynamicAgentTable = AgentGenerateSchema.extend({
      tools: z
        .array(
          z.enum(
            Array.from(toolNames).length > 0
              ? ([
                  Array.from(toolNames)[0],
                  ...Array.from(toolNames).slice(1),
                ] as [string, ...string[]])
              : ([""] as [string]),
          ),
        )
        .describe("Agent allowed tools name")
        .nullable()
        .default([]),
    });

    let unconnectedApps: Array<{ slug: string; name: string }> = [];
    if (isComposioConfigured()) {
      try {
        const [catalog, connectedAccounts] = await Promise.all([
          listComposioToolkits(session.user.id, { limit: 50 }),
          listComposioAccountsForUser(session.user.id, {
            includeShared: true,
          }),
        ]);
        const connectedSlugs = connectedAccounts.flatMap((account) =>
          account.toolkit?.slug ? [account.toolkit.slug] : [],
        );
        unconnectedApps = getUnconnectedAgentGenerationApps(
          (catalog as { items?: unknown[] }).items,
          connectedSlugs,
        );
      } catch {
        // The app catalog is optional; it must not block agent generation.
        logger.warn("Could not load Composio app suggestions for generation");
      }
    }

    const system = buildAgentGenerationPrompt(
      Array.from(toolNames),
      unconnectedApps,
    );

    try {
      teamBudgetLease = await reserveTeamBudgetForAiRequest({
        teamId,
        userId: session.user.id,
        model: chatModel,
        promptCharacters: system.length + message.length,
        idempotencyScope: "agent-generation",
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
        "Could not reserve team AI budget for agent generation",
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

    const result = streamObject({
      model: teamBudgetLease
        ? await customModelProvider.getModelAsync(chatModel)
        : await customModelProvider.getModelWithFailureFallbackAsync(chatModel),
      system,
      prompt: message,
      schema: dynamicAgentTable,
      abortSignal: request.signal,
      onFinish: async ({ usage }) => {
        await settleBudget({ usage }).catch((error) =>
          logger.error(
            "Could not settle team AI budget for agent generation",
            error,
          ),
        );
      },
      onError: async () => {
        await settleBudget({ aborted: true }).catch((error) =>
          logger.error("Could not release agent generation budget", error),
        );
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    if (teamBudgetLease && !budgetSettled) {
      await settleBudget({ aborted: true }).catch((releaseError) =>
        logger.error("Could not release agent generation budget", releaseError),
      );
    }
    logger.error(error);
    return new Response(JSON.stringify({ error: "Failed to generate agent" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
