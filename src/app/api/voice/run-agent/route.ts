import {
  getVoiceMcpToolDefinition,
  loadMcpTools,
} from "@/app/api/chat/shared.chat";
import { generateText, jsonSchema, tool } from "ai";
import { getSession } from "auth/server";
import {
  getEnabledAgentModelCatalog,
  resolveAgentChatModel,
} from "lib/ai/agent/pinned-model";
import {
  customModelProvider,
  ensureDynamicProvidersHydrated,
} from "lib/ai/models";
import { buildSpeechSystemPrompt } from "lib/ai/prompts";
import { matchAgentByReference } from "lib/ai/speech/match-agent";
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
import { mcpToolApprovalProposalSchema } from "lib/ai/tools/hitl/mcp-tool-approval";
import {
  agentRepository,
  siteConfigRepository,
  teamRepository,
} from "lib/db/repository";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import globalLogger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { getUserPreferences } from "lib/user/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_OUTPUT_CHARS = 6_000;
const MAX_MCP_TOOLS = 20;
const MAX_MCP_PROPOSALS = 3;
const REQUEST_SCHEMA = z
  .object({
    agent: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(2_000),
  })
  .strict();

const logger = globalLogger.withDefaults({
  message: "Voice agent delegation: ",
});

function resolveConfiguredDefaultModel(
  catalog: Awaited<ReturnType<typeof getEnabledAgentModelCatalog>>,
  providers: unknown,
) {
  if (providers && typeof providers === "object" && !Array.isArray(providers)) {
    for (const [provider, raw] of Object.entries(providers)) {
      if (!raw || typeof raw !== "object") continue;
      const config = raw as { enabled?: unknown; defaultModel?: unknown };
      if (config.enabled === false || typeof config.defaultModel !== "string")
        continue;
      const found = catalog.find(
        (item) =>
          item.provider.toLowerCase() === provider.toLowerCase() &&
          item.model === config.defaultModel,
      );
      if (found) return { provider: found.provider, model: found.model };
    }
  }
  const fallback = catalog[0];
  return fallback
    ? { provider: fallback.provider, model: fallback.model }
    : undefined;
}

export async function POST(request: Request) {
  let lease: TeamBudgetLease | undefined;
  let budgetSettled = false;
  const settle = async (input: { aborted?: boolean; usage?: unknown }) => {
    if (!lease || budgetSettled) return;
    budgetSettled = true;
    await settleTeamBudgetForAiRequest(lease, input);
    lease = undefined;
  };

  try {
    const session = await getSession({ disableCookieCache: true });
    const userId = session?.user?.id;
    if (!userId) return new Response("Unauthorized", { status: 401 });
    if (!hasSameOrigin(request))
      return new Response("Forbidden", { status: 403 });
    const rate = await checkApiRateLimit({
      kind: "voice-agent-run",
      id: userId,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });

    const bounded = await readBoundedJsonRequest(request, MAX_REQUEST_BYTES);
    if (!bounded.ok)
      return Response.json(
        { error: bounded.error },
        { status: bounded.status },
      );
    const parsed = REQUEST_SCHEMA.safeParse(bounded.value);
    if (!parsed.success)
      return Response.json(
        { error: "Invalid voice agent request" },
        { status: 400 },
      );

    const teamId = session.session.activeTeamId || undefined;
    if (teamId && !(await teamRepository.getTeamMember(teamId, userId))) {
      return new Response("Forbidden", { status: 403 });
    }

    const agents = await agentRepository.selectAgents(userId, ["all"], 50);
    const candidate = matchAgentByReference(agents, parsed.data.agent);
    if (
      !candidate ||
      !(await agentRepository.checkAccess(candidate.id, userId))
    ) {
      return Response.json(
        { error: "That agent is unavailable." },
        { status: 404 },
      );
    }
    const agent = await agentRepository.selectAgentById(candidate.id, userId);
    if (!agent)
      return Response.json(
        { error: "That agent is unavailable." },
        { status: 404 },
      );

    await ensureDynamicProvidersHydrated();
    const modelCatalog = await getEnabledAgentModelCatalog();
    let model;
    try {
      model = resolveAgentChatModel(undefined, agent, modelCatalog);
    } catch {
      return Response.json(
        { error: "This agent's configured model is unavailable." },
        { status: 503 },
      );
    }
    if (!model) {
      const config = await siteConfigRepository.getConfig("models");
      model = resolveConfiguredDefaultModel(modelCatalog, config?.providers);
    }
    if (!model)
      return Response.json(
        { error: "No enabled AI model is available." },
        { status: 503 },
      );

    let modelForGeneration;
    try {
      lease = await reserveTeamBudgetForAiRequest({
        teamId,
        userId,
        model,
        promptCharacters:
          parsed.data.question.length +
          (agent.instructions.systemPrompt?.length ?? 0),
        estimatedOutputTokens: 1_000,
        idempotencyScope: "voice-agent-run",
      });
      modelForGeneration = lease
        ? await customModelProvider.getModelAsync(model)
        : await customModelProvider.getModelWithFailureFallbackAsync(model);
    } catch (error) {
      if (lease && !budgetSettled) {
        await settle({ aborted: true }).catch((settlementError) =>
          logger.error(
            "Could not release voice agent reservation",
            settlementError,
          ),
        );
      }
      if (error instanceof TeamBudgetExceededError) {
        return Response.json(
          { code: "team-member-budget-exceeded", message: error.message },
          { status: 402 },
        );
      }
      if (error instanceof TeamBudgetAuthorizationError)
        return new Response("Forbidden", { status: 403 });
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
      throw error;
    }

    const preferences = await getUserPreferences(userId);
    // Only expose MCP tools explicitly configured on this currently accessible
    // agent. `loadMcpTools` rechecks server access, active schemas, and current
    // server-config fingerprints. These cloned definitions deliberately omit
    // `execute`; this model call can propose actions but cannot run them.
    const allowedMcpTools = await loadMcpTools({
      mentions: agent.instructions.mentions ?? [],
      userId,
      userRole: session.user.role,
    });
    const toolEntries = Object.entries(allowedMcpTools).slice(0, MAX_MCP_TOOLS);
    const proposalTools = Object.fromEntries(
      toolEntries.map(([name, mcpTool]) => {
        const definition = getVoiceMcpToolDefinition(mcpTool);
        return [
          name,
          tool({
            description: `${definition.description ?? ""}\nThis call only proposes an action for the user to review. Do not claim the action was completed.`,
            inputSchema: jsonSchema(definition.parameters),
          }),
        ];
      }),
    );
    const mappedTools = new Map(
      toolEntries.map(([name, mcpTool]) => [name, mcpTool]),
    );
    const system = `${buildSpeechSystemPrompt(session.user, preferences ?? undefined, agent, model)}\n\nThis is a delegated, single-turn response. You may answer using your instructions and context. External MCP actions are proposal-only: if an action is needed, call the matching tool with exact arguments. The system will show each proposal to the user and will execute it only after that user explicitly approves it. Never claim a proposed or rejected action was completed.`;
    try {
      const result = await generateText({
        model: modelForGeneration,
        system,
        prompt: parsed.data.question,
        ...(Object.keys(proposalTools).length ? { tools: proposalTools } : {}),
        maxOutputTokens: 1_000,
        abortSignal: AbortSignal.timeout(30_000),
      });
      await settle({ usage: result.totalUsage ?? result.usage }).catch(
        (error) => {
          logger.error("Could not settle voice agent team budget", error);
        },
      );
      const proposals = (result.toolCalls ?? [])
        .slice(0, MAX_MCP_PROPOSALS)
        .flatMap((call) => {
          const mcpTool = mappedTools.get(call.toolName);
          if (!mcpTool || !mcpTool._approvalConfigFingerprint) return [];
          const proposal = mcpToolApprovalProposalSchema.safeParse({
            serverId: mcpTool._mcpServerId,
            serverName: mcpTool._mcpServerName,
            toolName: mcpTool._originToolName,
            payload: call.input,
            serverConfigFingerprint: mcpTool._approvalConfigFingerprint,
          });
          return proposal.success ? [proposal.data] : [];
        });
      const answer = result.text.trim().slice(0, MAX_OUTPUT_CHARS);
      const proposedToolCount = result.toolCalls?.length ?? 0;
      const safeAnswer = proposedToolCount
        ? proposals.length
          ? `${agent.name} prepared ${proposals.length} action${proposals.length === 1 ? "" : "s"} for your review.`
          : `${agent.name} could not prepare a valid action. No action was run.`
        : answer || `${agent.name} did not return an answer.`;
      return Response.json({
        agentId: agent.id,
        agent: agent.name,
        answer: safeAnswer,
        proposals,
      });
    } catch (error) {
      await settle({ aborted: true }).catch((settlementError) => {
        logger.error(
          "Could not release failed voice agent budget",
          settlementError,
        );
      });
      logger.error("Delegated voice agent failed", error);
      return Response.json(
        { error: "The requested agent could not answer just now." },
        { status: 502 },
      );
    }
  } catch (error) {
    if (lease && !budgetSettled) {
      await settle({ aborted: true }).catch((settlementError) =>
        logger.error("Could not release voice agent budget", settlementError),
      );
    }
    logger.error("Voice agent delegation request failed", error);
    return Response.json(
      { error: "Could not run that agent." },
      { status: 500 },
    );
  }
}
