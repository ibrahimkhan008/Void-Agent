import {
  type ModelMessage,
  Tool,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import { eq } from "drizzle-orm";

import { planUsageRepository } from "@/lib/db/pg/repositories/plan-usage-repository.pg";
import { weekKey } from "@/lib/plan/limits";
import {
  getModelInstance,
  isToolCallUnsupportedModel,
  supportsImageInput,
} from "lib/ai/models";
import {
  MemberBudgetExceededError,
  type RoutingCandidate,
  RoutingPolicyError,
  detectModelSwitch,
  estimateCostMicros,
  extractRouteSignals,
  finalizeMemberBudget,
  findGatewayFallbackCandidate,
  findPreviousThreadChatModel,
  groupGatewayStepUsage,
  isRoutingSchemaUnavailableError,
  probeStreamViability,
  releaseMemberBudget,
  reserveMemberBudget,
  resolveAutomaticRoute,
  resolveBrowserAutomationGate,
  resolveFallbackModel,
  resolveGatewayFallbackCandidates,
  resolveUnattendedBrowserGate,
  resolveUnpricedFallbackCandidates,
  validateManualModel,
} from "lib/ai/routing";
import { SERVER_TOOL_STEP_BUDGET_MS } from "lib/code-runner/timeouts";

// Removed: import { getMCPClientsManager } from "lib/ai/mcp/mcp-manager";

import {
  ChatMention,
  ChatMetadata,
  chatApiSchemaRequestBodySchema,
} from "app-types/chat";
import {
  COMPOSIO_FALLBACK_SYSTEM_PROMPT,
  buildCurrentDateTimePrompt,
  buildHitlSystemPrompt,
  buildMcpServerCustomizationsSystemPrompt,
  buildPlanModeSystemPrompt,
  buildProjectInstructionsPrompt,
  buildProjectRecordsPrompt,
  buildSandboxAssetsSystemPrompt,
  buildSkillCatalogSystemPrompt,
  buildSkillsSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildUserSystemPromptWithMemory,
} from "lib/ai/prompts";
import {
  LoadSkillToolName,
  createLoadSkillTool,
} from "lib/ai/tools/skill/load-skill";
import { ChatThreadIdCollisionError } from "lib/db/pg/repositories/chat-repository.pg";
import {
  agentRepository,
  chatRepository,
  skillRepository,
} from "lib/db/repository";
import { flushLogs } from "lib/observability/register";
import globalLogger from "logger";
import { after } from "next/server";

import { resolveEncryptedChatRequestBody } from "@/lib/security/chat-payload-obfuscation.server";
import {
  resolveChatSecuritySessionId,
  resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionUserAgent,
  verifyChatRequestGuard,
} from "@/lib/security/chat-request-guard.server";
import {
  getChatRunConflictResponse,
  getChatThreadOwnershipError,
} from "lib/chat/chat-route-guards";
import { finalizeChatRunWithRecovery } from "lib/chat/finalize-chat-run-with-recovery";
import { generateThreadTitle } from "lib/chat/generate-thread-title";
import { persistFailedChatRun } from "lib/chat/persist-failed-chat-run";
import { buildThreadTitleSeed } from "lib/chat/thread-title";

import { errorIf, safe } from "ts-safe";

import { buildAgentKnowledgeRetrievalPrompt } from "@/lib/agentset/agent-knowledge";
import { AGENTSET_CITATION_GUIDELINES } from "@/lib/agentset/citation-context";
import { parseAgentModel } from "@/lib/ai/agent-model";
import { normalizeAgentInstructions } from "@/lib/ai/agent/normalize";
import {
  clearActiveStream,
  clearStop,
  getStreamContext,
  isStopRequested,
  setActiveStream,
} from "@/lib/ai/chat-stream-context";
import {
  buildDocumentContextPrompt,
  getProjectDocumentHandles,
} from "@/lib/ai/document-context";
import { buildIngestionPreviewParts } from "@/lib/ai/ingest";
import { loadHitlTools } from "@/lib/ai/tools/hitl/load-hitl-tools";
import {
  MemoryRecordToolName,
  createMemoryRecordTool,
} from "@/lib/ai/tools/memory-record";
import { VideoToolName, createVideoTool } from "@/lib/ai/tools/video";
import { loadUserProviderCredentials } from "@/lib/ai/user-provider-byok";
import { billingRunKey } from "@/lib/billing/usage-idempotency";
import { resolveKnowledgeBaseBindings } from "@/lib/chat/knowledge-base-mentions";
import { buildCitationSystemPrompt } from "@/lib/citations/parse-citations";
import { pgDb } from "@/lib/db/pg/db.pg";
import { recordsForAgentContext } from "@/lib/db/pg/repositories/project-records-repository.pg";
import { ProjectTable } from "@/lib/db/pg/schema.pg";
import {
  CreditsExhaustedError,
  assertCreditsAvailable,
  requireBillingContext,
  requireFeature,
  trackUsage,
} from "@/lib/gate";
import {
  enqueueProjectBrainRun,
  projectChatBrainRunKey,
} from "@/lib/project-brain/enqueue";
import { buildProjectRetrievalPrompt } from "@/lib/project-brain/retrieve-for-chat";
import { colorize } from "consola/utils";
import { isAgentBrowserConfigured } from "lib/agent-browser/client";
import { getContextWindow } from "lib/ai/model-context-windows";
import {
  OrchestratorToolName,
  createOrchestratorTool,
} from "lib/ai/orchestrator/orchestrator";
import {
  ANTHROPIC_CACHE_CONTROL,
  withTrailingCacheBreakpoint,
} from "lib/ai/prompt-cache";
import { createRequestTimer } from "lib/ai/request-timer";
import { collectSandboxAssets } from "lib/ai/sandbox-assets";
import { createResearchAgentTool } from "lib/ai/subagents/research-subagent";
import { aiTelemetry } from "lib/ai/telemetry";
import {
  DefaultToolName,
  ImageToolName,
  PublishPageToolName,
  ResearchToolName,
} from "lib/ai/tools";
import { createAgentBrowserAutomationTool } from "lib/ai/tools/browser/agent-browser-automation-tool";
import { createBrowserAutomationTool } from "lib/ai/tools/browser/browser-automation-tool";
import { createImageTool } from "lib/ai/tools/image";
import { createPlanTool } from "lib/ai/tools/planning/create-plan-tool";
import { createPublishPageTool } from "lib/ai/tools/publish/publish-page-tool";
import { selectIsolatedBrowserProvider } from "lib/browser-egress/capability";
import {
  resolveBrowserToolSuppression,
  shouldReadBrowserPolicy,
} from "lib/chat/browser-tool-gate";
import { isBrowserToolkitOn } from "lib/chat/browser-tool-pin";
import { isUnattended, resolveUnattendedToolkits } from "lib/chat/run-mode";
import {
  DENIED_UNATTENDED_CONTEXT,
  loadUnattendedContext,
} from "lib/chat/unattended-context";
import { browserCredentialRepository } from "lib/db/repository";
import { serverFileStorage } from "lib/file-storage";
import { IS_KERNEL_CONFIGURED } from "lib/kernel/client";
import { resolveBrowserCredentials } from "lib/kernel/credential-vault";
import { createSteelBrowserProvider } from "lib/steel/provider";
import { generateUUID } from "lib/utils";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import { compactLoopMessages } from "./chat/compact-loop-messages";
import { repairToolName } from "./chat/repair-tool-name";
import { appendRetrievalContext } from "./chat/retrieval-context";
import { slimHistoryForModel } from "./chat/slim-history";
import {
  CHAT_RUN_TIMEOUT_GRACE_MS,
  buildInitialMessageParts,
  buildMessageParts,
  createChatRunDeadline,
  resolveAbortOutcome,
  resolveChatSession,
} from "./route-helpers";
import {
  convertToSavePart,
  excludeToolExecution,
  extractInProgressToolPart,
  filterMcpServerCustomizations,
  handleError,
  loadAppDefaultTools,
  loadComposioTools,
  loadMcpTools,
  loadMcpToolsStateless,
  loadWorkFlowTools,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
  meterToolCalls,
} from "./shared.chat";

/**
 * Rough token estimate, matching the pre-flight budget estimate elsewhere in
 * this route. Only used to decide *whether* to compact, so a cheap
 * approximation beats a real tokenizer on the request path.
 */
const estimateTokens = (messages: ModelMessage[]) =>
  JSON.stringify(messages).length / 4;

/**
 * Compact once a turn is using this share of the model's context window.
 * Above gemini-cli's 0.5 and below opencode's effective ~0.9: the prune has to
 * leave room for the model's output and the next tool result, but firing early
 * trims context nobody needed to lose.
 */
const COMPACT_AT_CONTEXT_FRACTION = 0.7;

/**
 * Assumed window for models missing from MODEL_CONTEXT_WINDOWS (Local Models,
 * openai-compatible endpoints). Conservative on purpose: compacting a turn
 * that did not need it costs some context, guessing high costs the whole turn.
 */
const FALLBACK_CONTEXT_WINDOW = 64_000;

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
});

// Reasoning models spend most of a turn emitting tokens the user never sees, so
// a single step can legitimately run for minutes before it completes. Sized for
// that: the AI SDK budgets below still finish inside this with room to persist a
// terminal state. Per-route override — the project-level default cannot exceed
// 800s, but a function may go higher in code.
export const maxDuration = 300;

// Derived from maxDuration so the budgets below still nest inside it when the
// limit is lower (the community edition ships 300s, the most Vercel Hobby
// allows): the turn ends with a minute left to persist, and a step never
// outlives the turn.
const CHAT_TOTAL_MS = maxDuration * 1000 - 60_000;
const CHAT_STEP_MS = Math.min(300_000, CHAT_TOTAL_MS);

function chatErrorResponse(
  code: string,
  message: string,
  status: number,
  retryable = false,
) {
  return Response.json({ code, message, retryable }, { status });
}

function extractMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  // Per-request latency timer. Measures every blocking stage in front of the
  // model so we can see exactly what dominates time-to-first-token in prod.
  const timer = createRequestTimer("chat");
  let persistedMessage:
    | {
        threadId: string;
        id: string;
        role: UIMessage["role"];
        parts: UIMessage["parts"];
        metadata: ChatMetadata;
      }
    | undefined;
  const requestStartedAt = Date.now();
  let runDeadline: ReturnType<typeof createChatRunDeadline> | undefined;
  try {
    const rawBody = await request.json();

    // Browser sends arrive as { security, encryptedPayload }: recover the
    // plaintext with the challenge token before the guard verifies it.
    // Plaintext bodies (headless system tasks, guard-disabled dev) pass
    // through unchanged.
    const decryptedBodyResult = await resolveEncryptedChatRequestBody(rawBody);
    if (!decryptedBodyResult.ok) {
      return Response.json(
        {
          code: decryptedBodyResult.code,
          message: decryptedBodyResult.message,
        },
        { status: decryptedBodyResult.status },
      );
    }
    const json = decryptedBodyResult.body;

    const sessionOrResponse = await resolveChatSession(request);
    if (sessionOrResponse instanceof Response) {
      return sessionOrResponse;
    }
    const {
      session,
      headless: isHeadless,
      runMode,
      scheduledTaskId,
    } = sessionOrResponse;

    // Interactive browser requests must prove same-origin challenge ownership,
    // expiry, and single-use before any chat persistence or provider work.
    // Headless scheduled runs have already authenticated with the task secret
    // and intentionally cannot mint browser proof-of-work challenges.
    if (!isHeadless) {
      const guardResult = await verifyChatRequestGuard({
        request,
        body: json,
        userId: session.user.id,
        sessionId: resolveChatSecuritySessionId(session),
        sessionIpAddress: resolveChatSecuritySessionIpAddress(session),
        sessionUserAgent: resolveChatSecuritySessionUserAgent(session),
      });
      if (!guardResult.ok) {
        return Response.json(
          { code: guardResult.code, message: guardResult.message },
          { status: guardResult.status },
        );
      }
    }

    // Distinct from `isHeadless`: that one means "no client can answer an
    // execute-less tool", this one means "no human is present". See
    // `lib/chat/run-mode`.
    const isUnattendedRun = isUnattended(runMode);

    const parsedRequest = chatApiSchemaRequestBodySchema.safeParse(json);
    if (!parsedRequest.success) {
      return chatErrorResponse(
        "invalid_request",
        "The chat request is invalid. Please try sending your message again.",
        400,
      );
    }

    const {
      id,
      message: incomingMessage,
      chatModel: requestedChatModel,
      autoRouting,
      toolChoice,
      planMode,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      imageTool,
      mentions = [],
      attachments = [],
      projectId,
    } = parsedRequest.data;

    let chatModel = requestedChatModel;

    // Read before the agent's own tool mentions are merged in below, so the
    // list persisted onto the thread stays exactly what the composer attached.
    const composerKnowledgeBindings = resolveKnowledgeBaseBindings({
      mentions,
    });

    const validatedIncomingMessage = await safeValidateUIMessages<UIMessage>({
      messages: [incomingMessage],
    });
    if (!validatedIncomingMessage.success) {
      logger.warn(
        `Rejected invalid UI message for thread ${id}: ${validatedIncomingMessage.error.name}`,
      );
      return chatErrorResponse(
        "invalid_message",
        "This message could not be processed. Please try sending it again.",
        400,
      );
    }
    const message = validatedIncomingMessage.data[0]!;

    // Keep the first user message and a new thread in the same transaction.
    // The placeholder is explicitly retryable so a crash before generation can
    // be claimed safely on a subsequent request.
    const initialMessageParts = buildInitialMessageParts(
      message.parts,
      attachments,
    );
    const runAttemptId = message.role === "user" ? generateUUID() : undefined;
    const initialMessageMetadata: ChatMetadata = {
      ...(message.metadata as ChatMetadata | undefined),
      runId: message.id,
      ...(runAttemptId ? { runAttemptId } : {}),
      runStatus: "running",
      toolChoice,
      chatModel,
    };

    let thread = await chatRepository.selectThreadDetails(id);

    if (!thread) {
      if (message.role !== "user") {
        return chatErrorResponse(
          "invalid_message",
          "A conversation must start with a user message.",
          400,
        );
      }
      logger.info(
        `create chat thread: ${id}${projectId ? ` (project: ${projectId})` : ""}`,
      );
      try {
        await chatRepository.insertThreadWithFirstMessage(
          {
            id,
            title: "",
            userId: session.user.id,
            projectId,
            knowledgeBases: composerKnowledgeBindings,
          },
          {
            id: message.id,
            threadId: id,
            role: "user",
            parts: initialMessageParts.map(convertToSavePart),
            metadata: {
              ...initialMessageMetadata,
              runStatus: "failed",
              error: { code: "not_started", retryable: true },
            },
          },
        );
      } catch (error) {
        // Another request may have created this thread while our first read was
        // in flight. Re-read it, then let ownership and run-claim checks decide
        // whether this request is an authorized continuation or a replay.
        if (!(error instanceof ChatThreadIdCollisionError)) throw error;
      }
      thread = await chatRepository.selectThreadDetails(id);
      if (!thread) {
        throw new Error("New conversation could not be loaded after creation");
      }
    }

    const ownershipError = getChatThreadOwnershipError(
      thread!,
      session.user.id,
    );
    if (ownershipError) return ownershipError;

    // The submitted message and its attachment references are durable before
    // any file processing, tool discovery, provider call, or stream begins.
    // Code execution starts client-side as soon as its tool input streams, so a
    // later onEnd-only attachment write races the sandbox staging request.
    const persistedInitialMessage = {
      threadId: thread!.id,
      role: message.role,
      parts: initialMessageParts.map(convertToSavePart),
      id: message.id,
      metadata: initialMessageMetadata,
    };
    const claimedMessage =
      message.role === "user"
        ? await chatRepository.claimMessageRun(persistedInitialMessage)
        : await chatRepository.upsertMessage(persistedInitialMessage);
    persistedMessage = {
      threadId: thread!.id,
      id: message.id,
      role: message.role,
      parts: initialMessageParts,
      metadata: claimedMessage.metadata ?? initialMessageMetadata,
    };
    const markPreStreamFailure = async () => {
      await persistFailedChatRun({
        metadata: initialMessageMetadata,
        persist: (failedMetadata) => {
          const failedMessage = {
            threadId: thread!.id,
            role: message.role,
            parts: initialMessageParts.map(convertToSavePart),
            id: message.id,
            metadata: failedMetadata,
          };
          return message.role === "user"
            ? chatRepository.failMessageRun(failedMessage)
            : chatRepository.upsertMessage(failedMessage);
        },
        onPersistenceError: (error) =>
          logger.error("Unable to persist pre-stream chat failure", error),
      });
    };

    // Resolve the model only after the user's message is durable. A missing or
    // misconfigured provider must be recoverable from the saved thread.
    const activeOrganizationId = (
      session.session as { activeOrganizationId?: string | null } | undefined
    )?.activeOrganizationId;

    // Resolve a mentioned agent before model routing: an agent with a pinned
    // model overrides both the request's selected model and auto-routing. The
    // pinned model still flows through validateManualModel below, so org
    // allowlists and member budgets apply to it like any manual selection.
    const agentId = (
      mentions.find((m) => m.type === "agent") as Extract<
        ChatMention,
        { type: "agent" }
      >
    )?.agentId;
    const agent = await rememberAgentAction(
      agentId,
      session.user.id,
      activeOrganizationId,
    );
    const agentModel = parseAgentModel(agent?.model);
    let effectiveAutoRouting = autoRouting;
    if (agentModel) {
      chatModel = agentModel;
      effectiveAutoRouting = false;
    }

    const userText = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const configuredToolCount =
      toolChoice === "none"
        ? 0
        : (allowedAppDefaultToolkit?.length ?? 0) +
          Object.values(allowedMcpServers ?? {}).reduce(
            (count, server) => count + server.tools.length,
            0,
          ) +
          mentions.length;
    // Automatic routing decides once per thread, not once per message. Task
    // signals are recomputed from every message, so re-scoring each turn moved
    // a conversation between models mid-flight — and the prompt cache is keyed
    // per provider *and* model, so each move re-sent the whole history at full
    // price to a model that had never seen it. Routing re-uses the model the
    // thread already ran on unless it can no longer serve the turn (see
    // `selectDeterministicRoute`); an empty value here is a first turn.
    const threadModel = findPreviousThreadChatModel(thread?.messages);
    let routingMetadata: ChatMetadata["routing"] = {
      automatic: effectiveAutoRouting,
    };
    let resolvedCandidate: RoutingCandidate | undefined;
    let memberId: string | undefined;

    try {
      if (effectiveAutoRouting) {
        const route = await resolveAutomaticRoute({
          organizationId: activeOrganizationId,
          userId: session.user.id,
          signals: extractRouteSignals({
            text: userText,
            attachments,
            toolCount: configuredToolCount,
          }),
          previousChatModel: threadModel,
        });
        chatModel = route.candidate.chatModel;
        resolvedCandidate = route.candidate;
        memberId = route.memberId;
        routingMetadata = {
          automatic: true,
          taskKey: route.taskKey,
          reasonCode: route.reasonCode,
        };
      } else if (chatModel) {
        const manualRoute = await validateManualModel({
          organizationId: activeOrganizationId,
          userId: session.user.id,
          chatModel,
        });
        chatModel = manualRoute.chatModel;
        resolvedCandidate = manualRoute.candidate;
        memberId = manualRoute.memberId;
      }
    } catch (error) {
      if (isRoutingSchemaUnavailableError(error)) {
        logger.error(
          "Model-routing tables are not migrated; falling back to the selected model.",
        );
        routingMetadata = {
          automatic: false,
          reasonCode: "routing_schema_unavailable",
        };
      } else if (error instanceof RoutingPolicyError) {
        // §3.1 "model fallback and retry": the admin Models settings persist
        // per-provider chains + a global chain — walk them before refusing.
        // Resolution-time only: a fallback that the org policy refuses is
        // skipped; the first allowed entry becomes the chat model.
        const fallback = chatModel
          ? await resolveFallbackModel({
              organizationId: activeOrganizationId,
              userId: session.user.id,
              primary: chatModel,
            })
          : null;
        if (fallback) {
          chatModel = fallback.chatModel;
          resolvedCandidate = fallback.candidate;
          memberId = fallback.memberId;
          routingMetadata = {
            automatic: false,
            reasonCode: "fallback_chain",
          };
          logger.info(
            `[chat] fallback chain applied: ${fallback.chatModel.provider}/${fallback.chatModel.model}`,
          );
        } else {
          await markPreStreamFailure();
          return chatErrorResponse(error.code, error.message, 403);
        }
      } else {
        // Anything else here is infrastructure (e.g. a database connection-pool
        // checkout timeout), not a policy decision. Model routing must never
        // take chat down: fall back to the selected model so the already-saved
        // message still streams instead of surfacing a retryable
        // `chat_unavailable` that only invites more load on a stressed pool.
        logger.error(
          "Model routing failed unexpectedly; falling back to the selected model.",
          error,
        );
        routingMetadata = {
          automatic: false,
          reasonCode: "routing_unavailable",
        };
      }
    }

    if (chatModel?.provider === "Local Models") {
      try {
        await requireFeature("local_models");
      } catch (error) {
        await markPreStreamFailure();
        return chatErrorResponse(
          "local_models_subscription_required",
          error instanceof Error
            ? error.message
            : "Local Models Pro subscription required.",
          403,
        );
      }
    }

    const billingContext = await requireBillingContext().catch(() => ({
      customerId: session.user.id,
      userId: session.user.id,
      entityId: undefined,
    }));
    const { customerId, entityId } = billingContext;

    // Authoritative spend gate. The usage-limit modal in the (chat) layout only
    // re-evaluates on a page load, so without this check a user with an open tab
    // (or a direct API caller) can spend far past their plan's allowance.
    // Local Models run on customer-owned inference and are gated by the flat
    // subscription entitlement above, not by the metered credit pool.
    if (chatModel?.provider !== "Local Models") {
      try {
        await assertCreditsAvailable({ customerId, entityId });
      } catch (error) {
        if (error instanceof CreditsExhaustedError) {
          await markPreStreamFailure();
          return chatErrorResponse("CREDITS_EXHAUSTED", error.message, 402);
        }
        throw error;
      }
    }

    // Kick off the independent pre-stream stages together. None depends on the
    // others: model resolution needs only the routed chatModel, and reading the
    // attachments needs only their storage keys. (The agent was resolved
    // earlier — before routing — because its pinned model feeds model
    // resolution.) Reading attachments blocks the stream — the model needs
    // their text in its first prompt — so it is tracked as a stage. Without
    // this its cost was invisible in `stages` and a slow format could not be
    // told from a slow model.
    //
    // `session.user.id` goes to the reader, not just the thread: the attachment
    // array arrives in the request body, so a key in it is under the caller's
    // control and the storage client holds the service role.
    //
    // Vision models also get PDF pages rendered as images: extraction keeps the
    // words and throws the document away, which is exactly what a question
    // about layout or appearance needs.
    const [model, ingestionPreviewParts] = await Promise.all([
      getModelInstance(chatModel, session.user.id),
      timer.track("ingest", () =>
        buildIngestionPreviewParts(
          attachments,
          (key) => serverFileStorage.download(key),
          { userId: session.user.id },
          {
            supportsVision: supportsImageInput(chatModel),
            // Per-format stages, so a slow format is visible as itself rather
            // than as "reading files was slow". Called once per format, and
            // format ids are a fixed set of six, so this stays
            // low-cardinality.
            onFormatTiming: (formatId, ms) =>
              timer.mark(`ingest:${formatId}`, ms),
          },
        ),
      ),
    ]);
    // Validated fallback chain (§3.1 "model fallback and retry"): policy-
    // checked candidates priced no higher than the primary, capability-gated.
    // Consumed two ways — the AI Gateway's pre-output `models` failover in
    // gateway mode, and the mid-stream retry before the first UI chunk in
    // every mode.
    const streamFallbacks: RoutingCandidate[] = [];
    const gatewayFallbacks: Array<{
      candidate: RoutingCandidate;
      modelId: string;
    }> = [];
    if (chatModel) {
      try {
        // With a priced candidate the chain is price-capped at the primary so
        // the billing reservation stays a conservative upper bound; without
        // one (routing could not price the model) the chain is still
        // org-policy-validated, just unpriced.
        const candidates = resolvedCandidate
          ? await resolveGatewayFallbackCandidates({
              organizationId: activeOrganizationId,
              userId: session.user.id,
              primary: chatModel,
              primaryCandidate: resolvedCandidate,
              // The eventual tool set also includes built-in tools added later in
              // route preparation, so use the stricter request-level gate here.
              requiresTools: toolChoice !== "none",
              requiresVision: attachments.some(
                (attachment) =>
                  attachment.mediaType?.startsWith("image/") ||
                  attachment.mediaType === "application/pdf",
              ),
            })
          : await resolveUnpricedFallbackCandidates({
              organizationId: activeOrganizationId,
              userId: session.user.id,
              primary: chatModel,
              requiresTools: toolChoice !== "none",
              requiresVision: attachments.some(
                (attachment) =>
                  attachment.mediaType?.startsWith("image/") ||
                  attachment.mediaType === "application/pdf",
              ),
            });
        for (const candidate of candidates) {
          // The primary is never its own fallback.
          if (
            candidate.chatModel.provider === chatModel.provider &&
            candidate.chatModel.model === chatModel.model
          ) {
            continue;
          }
          streamFallbacks.push(candidate);
        }
      } catch (error) {
        // Fallback is optional; a config or routing lookup failure must not
        // take down a chat request that already resolved its primary model.
        logger.warn("[chat] could not resolve fallback candidates", error);
      }
    }
    if (typeof model === "string") {
      for (const candidate of streamFallbacks) {
        try {
          const fallbackModel = await getModelInstance(
            candidate.chatModel,
            session.user.id,
          );
          if (
            typeof fallbackModel === "string" &&
            fallbackModel !== model &&
            !gatewayFallbacks.some((entry) => entry.modelId === fallbackModel)
          ) {
            gatewayFallbacks.push({ candidate, modelId: fallbackModel });
          }
        } catch (error) {
          logger.warn(
            `[chat] skipping unavailable Gateway fallback ${candidate.chatModel.provider}/${candidate.chatModel.model}`,
            error,
          );
        }
      }
    }
    const gatewayByok =
      typeof model === "string"
        ? await loadUserProviderCredentials(
            [model, ...gatewayFallbacks.map(({ modelId }) => modelId)],
            session.user.id,
          )
        : {};
    const primaryRoutingCandidate = resolvedCandidate;

    const messages: UIMessage[] = (thread?.messages ?? []).map((m) => {
      return {
        id: m.id,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata,
      };
    });

    if (messages.at(-1)?.id == message.id) {
      messages.pop();
    }

    message.parts = buildMessageParts(
      message.parts,
      attachments,
      ingestionPreviewParts,
    );

    messages.push(message);

    // Unique per POST, and therefore per model run. Both the budget reservation
    // and the usage event key off it.
    //
    // Keying those off `message.id` alone was wrong: a client-side tool (one
    // declared without `execute`) ends the stream, the browser runs the tool and
    // posts back — same user message, new model run. Production showed 14 runs
    // on one message id, of which Autumn billed the first and rejected 13 as
    // `duplicate_idempotency_key`, and the member's cap counted one reservation
    // for all 14. Both under-counted by roughly the whole tool loop.
    //
    // Still stable *within* a run, which is what idempotency is actually for:
    // `trackWithRetry` retries with identical params and must stay deduped.
    const runId = generateUUID();

    let budgetReservationId: string | undefined;
    if (resolvedCandidate) {
      const estimatedInputTokens = Math.ceil(
        JSON.stringify(messages).length / 4,
      );
      const estimatedCost = estimateCostMicros({
        inputTokens: estimatedInputTokens,
        outputTokens: 4096,
        candidate: resolvedCandidate,
      });
      try {
        const reservation = await reserveMemberBudget({
          memberId,
          deploymentId: resolvedCandidate.deploymentId,
          estimateMicros: estimatedCost,
          idempotencyKey: billingRunKey({
            scope: "reserve",
            subject: memberId ?? session.user.id,
            detail: message.id,
            runId,
          }),
        });
        budgetReservationId = reservation?.id;
      } catch (error) {
        if (error instanceof MemberBudgetExceededError) {
          await markPreStreamFailure();
          return chatErrorResponse(
            "MEMBER_BUDGET_EXCEEDED",
            error.message,
            402,
          );
        }
        // A budget reservation is a best-effort guard; actual usage is still
        // tracked after the run. An infrastructure failure here (e.g. a pool
        // checkout timeout) must not block the chat, so continue without a
        // reservation instead of failing the request.
        logger.error(
          "Budget reservation failed unexpectedly; proceeding without a reservation.",
          error,
        );
        budgetReservationId = undefined;
      }
    }

    const supportToolCall = !isToolCallUnsupportedModel(model);

    if (agent) {
      // Merge the agent's capabilities via the normalize seam: tools + skills
      // as named parts rather than one opaque mentions blob. Behaviour is
      // unchanged — the same set drives tool loading and skill injection below.
      const def = normalizeAgentInstructions(agent.instructions);
      mentions.push(...def.tools, ...def.skills);
    }

    const useImageTool = Boolean(imageTool?.model) || Boolean(imageTool?.mask);

    // Plan mode replaces the whole tool surface with research + createPlan;
    // every regular tool source below is gated off via isToolCallAllowed, so
    // no MCP/workflow/Composio/app-default loading happens for these turns.
    const planModeActive = planMode && supportToolCall && !useImageTool;

    const isToolCallAllowed =
      supportToolCall &&
      toolChoice !== "none" &&
      !useImageTool &&
      !planModeActive;

    // A model switch throws away the prompt cache for the whole thread: the
    // cache is keyed per provider *and* model, so the next turn re-pays full
    // price for history the previous model had already cached. Automatic
    // routing pins a thread to its previous model, so what is left to record
    // here is a user switching by hand, or a pin dropped because the model
    // could not serve this turn. Free to compute: the thread is already loaded
    // and every assistant message records the model it ran on.
    const modelSwitch = detectModelSwitch({
      messages: thread?.messages,
      current: chatModel,
      automatic: routingMetadata.automatic,
    });

    if (modelSwitch) {
      routingMetadata = { ...routingMetadata, switchedFrom: modelSwitch.from };
      logger.info(
        `[model-switch] thread=${id} ${modelSwitch.from} -> ${modelSwitch.to} by=${
          modelSwitch.automatic ? "routing" : "user"
        }`,
      );
    }

    const metadata: ChatMetadata = {
      runId: message.id,
      ...(message.role === "user" && initialMessageMetadata.runAttemptId
        ? { runAttemptId: initialMessageMetadata.runAttemptId }
        : {}),
      runStatus: "running",
      agentId: agent?.id,
      toolChoice: toolChoice,
      toolCount: 0,
      chatModel: chatModel,
      routing: routingMetadata,
    };

    // Server-owned abort so a stop can be detached from the viewer. With Redis
    // we poll the stop flag every 2s (survives a closed tab) and buffer the SSE
    // into a resumable stream; without it we fall back to the Phase 1
    // request-signal (viewer-bound) abort. The poll interval is cleared on every
    // stream exit path below so it can never leak.
    const streamContext = getStreamContext();
    const resumeEnabled = streamContext !== null;
    const streamId = generateUUID();
    const abortController = new AbortController();
    // The SDK's total timeout begins only when generation starts. Bound the
    // whole request as well, so slow preflight work cannot consume the route's
    // remaining runtime and prevent the terminal message state from saving.
    runDeadline = createChatRunDeadline({
      abortController,
      timeoutMs: Math.max(
        1,
        maxDuration * 1_000 -
          CHAT_RUN_TIMEOUT_GRACE_MS -
          (Date.now() - requestStartedAt),
      ),
    });
    // Set only when the abort came from the user (stop button / closed tab), so
    // onAbort can tell a deliberate stop from an exhausted budget.
    let stopRequestedAt: number | null = null;
    let failurePersistence: Promise<ChatMetadata> | undefined;
    let stopPoll: ReturnType<typeof setInterval> | undefined;
    const clearStopPoll = () => {
      if (stopPoll) {
        clearInterval(stopPoll);
        stopPoll = undefined;
      }
    };

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // Arm the abort strategy before any tool runs so both the manual tool
        // execution below and streamText observe the same controller.
        if (resumeEnabled) {
          // A stop flag can outlive its run (stop POSTed just as the run
          // finished naturally, or from a tab with stale UI) and would abort
          // this fresh run within one poll tick — clear it first. A Redis
          // failure here must not take the chat down.
          await clearStop(id).catch(() => {});
          stopPoll = setInterval(() => {
            void isStopRequested(id)
              .then((stopped) => {
                if (stopped) {
                  stopRequestedAt = Date.now();
                  abortController.abort();
                  clearStopPoll();
                }
              })
              .catch(() => {});
          }, 2000);
        } else if (request.signal.aborted) {
          stopRequestedAt = Date.now();
          abortController.abort();
        } else {
          request.signal.addEventListener(
            "abort",
            () => {
              stopRequestedAt = Date.now();
              abortController.abort();
            },
            { once: true },
          );
        }

        // Feature flag for stateless RPC migration (set USE_STATELESS_MCP=false to rollback)
        const USE_STATELESS_MCP = process.env.USE_STATELESS_MCP !== "false";

        // HITL tools are synchronous (no I/O), so build them up front.
        // 🔥 Pass userId for secure MCP server scoping
        // Every HITL tool is declared without an `execute`: the unresolved call
        // is how it waits for a person. On an unattended run nobody answers, so
        // binding them only buys a `finishReason: "tool-calls"` failure and a
        // wasted model turn.
        const HITL_TOOLS = isUnattendedRun
          ? {}
          : loadHitlTools(session.user.id);

        // ── Parallel pre-stream loading ──────────────────────────────────
        // These stages are independent network/DB calls that previously ran
        // sequentially, stacking their latencies in front of the model. Kick
        // them off together so the blocking time before first token is ~max
        // (slowest stage) instead of the sum. `mcpCustomizations` is the only
        // dependent stage (it needs the loaded MCP tools) and is chained off
        // the MCP promise. Each stage keeps its own ts-safe/catch fallback, so
        // a single failure degrades that stage only — never the whole request.
        const mcpToolsPromise = timer.track("mcpTools", () =>
          safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() => {
              if (USE_STATELESS_MCP) {
                logger.info("Using stateless MCP loader (RPC)");
                return loadMcpToolsStateless(session.user.id, {
                  mentions,
                  allowedMcpServers,
                  organizationId: activeOrganizationId,
                });
              } else {
                logger.warn("Using legacy stateful MCP loader (fallback)");
                return loadMcpTools(session.user.id, {
                  mentions,
                  allowedMcpServers,
                  organizationId: activeOrganizationId,
                });
              }
            })
            .orElse({}),
        );

        const mcpCustomizationsPromise = mcpToolsPromise.then((MCP_TOOLS) =>
          timer.track("mcpCustomizations", () =>
            safe()
              .map(() => {
                if (Object.keys(MCP_TOOLS ?? {}).length === 0)
                  throw new Error("No tools found");
                return rememberMcpServerCustomizationsAction(session.user.id);
              })
              .map((v) => filterMcpServerCustomizations(MCP_TOOLS!, v))
              .orElse({}),
          ),
        );

        const workflowToolsPromise = timer.track("workflowTools", () =>
          safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadWorkFlowTools({
                mentions,
                dataStream,
                caller: {
                  userId: session.user.id,
                  organizationId: activeOrganizationId,
                },
              }),
            )
            .orElse({}),
        );

        const composioToolsPromise = timer.track("composioTools", () =>
          safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() => loadComposioTools(session.user.id))
            // Composio bills per tool call, so every invocation gets counted.
            // Wrapping here rather than inside the loader keeps the per-user
            // tool cache free of request-scoped billing identity.
            .map((tools) => meterToolCalls(tools, { customerId, entityId }))
            .orElse({}),
        );

        // An unattended run's grants live on its scheduled_task row, not in the
        // request body. Loaded only on that path, and fails closed. Hoisted
        // above the tool loaders because the row also decides the run's
        // toolkits: a Cloud Agent task's work executes on the E2B sandbox, so
        // the Code toolkit (the E2B-backed python/js execution tools) is
        // unioned in whatever the loopback body carried — the body can no
        // longer strip the sandbox off the run.
        const unattendedContext = isUnattendedRun
          ? await loadUnattendedContext({
              scheduledTaskId,
              userId: session.user.id,
            })
          : DENIED_UNATTENDED_CONTEXT;
        const runAllowedAppDefaultToolkit = resolveUnattendedToolkits({
          executionMode: unattendedContext.executionMode,
          allowedAppDefaultToolkit,
        });

        const appDefaultToolsPromise = timer.track("appDefaultTools", () =>
          safe()
            .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
            .map(() =>
              loadAppDefaultTools({
                mentions,
                allowedAppDefaultToolkit: runAllowedAppDefaultToolkit,
                userId: session.user.id,
                billingCustomerId: customerId,
                billingEntityId: entityId,
                projectId: thread?.projectId, // Pass projectId for RAG-enabled project chats
                threadId: thread?.id,
                // The agent's own files ride into every sandbox run, so a saved
                // template/render script is there without the user re-uploading.
                agentFiles: agent?.instructions?.files,
                headless: isHeadless,
              }),
            )
            .orElse({}),
        );

        // Skills the user explicitly selected (via the Skills menu, the "/"
        // trigger, or attached to the active agent) get their full instructions
        // hard-injected into the system prompt.
        const selectedSkillIds = Array.from(
          new Set(
            mentions
              .filter(
                (m): m is Extract<ChatMention, { type: "skill" }> =>
                  m.type === "skill",
              )
              .map((m) => m.skillId),
          ),
        );
        const selectedSkillsPromise = timer.track("selectedSkills", () =>
          selectedSkillIds.length
            ? Promise.all(
                selectedSkillIds.map((skillId) =>
                  skillRepository.selectSkillById(
                    skillId,
                    session.user.id,
                    activeOrganizationId,
                  ),
                ),
              ).then((skills) => skills.filter((s) => s != null))
            : Promise.resolve([]),
        );

        // Auto mode only: a lightweight name+description catalog of all in-scope
        // skills, which the model reads and loads on demand via loadSkill.
        const skillCatalogPromise = timer.track("skillCatalog", () =>
          !planModeActive && toolChoice === "auto"
            ? skillRepository.selectSkills(
                session.user.id,
                ["all"],
                100,
                activeOrganizationId,
              )
            : Promise.resolve([]),
        );

        const documentHandlesPromise = timer.track("documentHandles", () =>
          getProjectDocumentHandles({
            userId: session.user.id,
            projectId: thread?.projectId,
          }),
        );

        // Capture the narrowed projectId in a const so the type guard below
        // propagates into the timer.track() closure (control-flow narrowing of
        // `thread.projectId` doesn't flow into a nested function).
        const retrievalProjectId = thread?.projectId;
        const projectRetrievalPromise =
          retrievalProjectId && message.role === "user"
            ? timer.track("projectRetrieval", () =>
                buildProjectRetrievalPrompt({
                  userId: session.user.id,
                  projectId: retrievalProjectId,
                  query: extractMessageText(message.parts),
                }),
              )
            : Promise.resolve({ prompt: "", sources: [] });

        // Stable for the life of the thread (only changes when someone edits
        // project settings), so it rides in the cache-stable prefix rather
        // than the volatile tail.
        const projectInstructionsPromise = retrievalProjectId
          ? timer.track("projectInstructions", () =>
              pgDb
                .select({ systemPrompt: ProjectTable.systemPrompt })
                .from(ProjectTable)
                .where(eq(ProjectTable.id, retrievalProjectId))
                .limit(1)
                .then((rows) => rows[0]?.systemPrompt ?? null),
            )
          : Promise.resolve(null);

        // Void Memory (§3.3): the project's record documents (MEMORY.md,
        // TODO.md, RULES.md, …) whose per-record retrieval tuning includes
        // them. Only changes when someone edits a record, so it rides in the
        // cache-stable prefix right after the instructions.
        const projectRecordsPromise = retrievalProjectId
          ? timer.track("projectRecords", () =>
              recordsForAgentContext(retrievalProjectId),
            )
          : Promise.resolve("");

        // Knowledge sources for this turn: the ones the active agent is bound
        // to, the ones stored on the thread, and the ones this request's
        // composer mentions carry. Only those namespaces are searched, and the
        // builder re-validates access on every id. Projects already covered by
        // the thread's own retrieval are excluded.
        const knowledgeBindings = resolveKnowledgeBaseBindings({
          mentions,
          bindings: [
            ...(agent?.instructions?.knowledgeBases ?? []),
            // What the thread itself carries. A client that never sent the
            // mentions (a resumed thread, a scheduled run) still retrieves.
            ...(thread?.knowledgeBases ?? []),
          ],
        });
        // Gates the citation rules in the cache-stable prefix. It only flips
        // when the thread's knowledge sources change (attaching one in the
        // composer, or switching agent), so ordinary turns still hit the
        // prompt cache.
        const hasKnowledgeRetrieval = Boolean(
          retrievalProjectId || knowledgeBindings.length,
        );
        const agentKnowledgePromise =
          knowledgeBindings.length && message.role === "user"
            ? timer.track("agentKnowledgeRetrieval", () =>
                buildAgentKnowledgeRetrievalPrompt({
                  userId: session.user.id,
                  activeOrganizationId,
                  query: extractMessageText(message.parts),
                  bindings: knowledgeBindings,
                  excludeProjectId: retrievalProjectId,
                }),
              )
            : Promise.resolve({ prompt: "", sources: [] });

        const [
          MCP_TOOLS,
          mcpServerCustomizations,
          WORKFLOW_TOOLS,
          COMPOSIO_TOOLS,
          APP_DEFAULT_TOOLS,
          documentHandles,
          projectRetrievalResult,
          agentKnowledgeResult,
          selectedSkills,
          skillCatalog,
          projectInstructions,
          projectRecords,
        ] = await Promise.all([
          mcpToolsPromise,
          mcpCustomizationsPromise,
          workflowToolsPromise,
          composioToolsPromise,
          appDefaultToolsPromise,
          documentHandlesPromise,
          projectRetrievalPromise,
          agentKnowledgePromise,
          selectedSkillsPromise,
          skillCatalogPromise,
          projectInstructionsPromise,
          projectRecordsPromise,
        ]);
        logger.info(
          `Loaded ${Object.keys(MCP_TOOLS).length} MCP tools, ${Object.keys(COMPOSIO_TOOLS).length} Composio tools for chat`,
        );

        const userPreferences = thread?.userPreferences || undefined;

        // Resolve any in-progress (manual) tool executions now that all tool
        // sources are loaded. Must finish before streaming starts.
        const inProgressToolParts = extractInProgressToolPart(message);
        if (inProgressToolParts.length) {
          await Promise.all(
            inProgressToolParts.map(async (part) => {
              const output = await manualToolExecuteByLastMessage(
                part,
                {
                  ...MCP_TOOLS,
                  ...WORKFLOW_TOOLS,
                  ...HITL_TOOLS,
                  ...APP_DEFAULT_TOOLS,
                },
                session.user.id,
                // A detached viewer must not cancel an already-approved
                // server-side tool, but an unbounded hang must not ride to the
                // 240s stream limit either, and an explicit stop should still
                // cancel it. Bound by a standalone 90s timeout OR the
                // server-owned abort controller.
                AbortSignal.any([
                  AbortSignal.timeout(90_000),
                  abortController.signal,
                ]),
              );
              part.output = output;

              dataStream.write({
                type: "tool-output-available",
                toolCallId: part.toolCallId,
                output,
              });
            }),
          );
        }

        const documentContextPrompt =
          buildDocumentContextPrompt(documentHandles);

        const projectRetrievalPrompt = projectRetrievalResult.prompt;
        const agentKnowledgePrompt = agentKnowledgeResult.prompt;
        const retrievalSources = [
          ...projectRetrievalResult.sources,
          ...agentKnowledgeResult.sources,
        ];
        if (retrievalSources.length > 0) {
          metadata.retrievalSources = retrievalSources;
        }

        // Agentset retrieval prompt includes citation rules; avoid conflicting numbering.
        const projectDocCitationPrompt =
          documentHandles.length > 0 &&
          !projectRetrievalPrompt &&
          !agentKnowledgePrompt
            ? buildCitationSystemPrompt(
                documentHandles.map((d) => ({
                  id: d.documentId,
                  title: d.filename,
                })),
              )
            : "";

        const attachmentCitationPrompt =
          ingestionPreviewParts.length > 0
            ? buildCitationSystemPrompt(
                attachments.map((attachment, index) => ({
                  id: String(index + 1),
                  title: attachment.filename ?? `Attachment ${index + 1}`,
                })),
              )
            : "";

        // Catalog excludes skills already hard-injected so the model doesn't see
        // them twice. Only populated in Auto mode (see skillCatalogPromise).
        const skillCatalogPrompt = buildSkillCatalogSystemPrompt(
          skillCatalog.filter((s) => !selectedSkillIds.includes(s.id)),
        );

        // Hand the model the public URLs of everything uploaded in this
        // thread. Without it the only way it can get a user's image into a
        // generated page is base64 or an external upload, neither of which
        // survives the sandbox. Reading the whole thread rather than just this
        // turn's `attachments` matters: uploading in one turn and asking for a
        // page in the next is the normal flow, and the request-only version
        // left the model with nothing to reference.
        const sandboxAssetsPrompt = buildSandboxAssetsSystemPrompt(
          collectSandboxAssets(messages),
        );

        // Ordered most-stable -> most-volatile. Prompt caching is a prefix
        // match, so anything that changes per request has to sit at the end or
        // it invalidates everything after it. HITL still precedes the MCP
        // customizations (its safety rules must win over per-server prompts).
        const systemPrompt = mergeSystemPrompt(
          await buildUserSystemPromptWithMemory(
            session.user,
            userPreferences,
            agent,
          ),
          projectInstructions
            ? buildProjectInstructionsPrompt(projectInstructions)
            : undefined,
          projectRecords
            ? buildProjectRecordsPrompt(projectRecords)
            : undefined,
          planModeActive && buildPlanModeSystemPrompt(),
          // ~870 tokens of tool-approval rules. Unreachable, but still billed,
          // when the model cannot call tools at all — or when there is no human
          // to approve anything.
          isToolCallAllowed && !isUnattendedRun && buildHitlSystemPrompt(),
          // Ranks Composio below first-party and MCP tools. Present exactly
          // when Composio tools are bound: stable per user (the connection
          // check is TTL-cached), so it stays in the cacheable prefix.
          isToolCallAllowed &&
            Object.keys(COMPOSIO_TOOLS).length > 0 &&
            COMPOSIO_FALLBACK_SYSTEM_PROMPT,
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          buildSkillsSystemPrompt(selectedSkills),
          skillCatalogPrompt,
          // Rules only. The chunks they describe ride with the user's message
          // (see appendRetrievalContext) so this stays byte-stable. Gated on
          // thread/agent configuration rather than on whether retrieval
          // actually returned anything - the latter flips per question and
          // would reintroduce the invalidation this split removes.
          hasKnowledgeRetrieval && AGENTSET_CITATION_GUIDELINES,
          documentContextPrompt,
          projectDocCitationPrompt,
          attachmentCitationPrompt,
          // Nothing per-request below this line. The sandbox URLs and the clock
          // ride with the user's message instead (see appendRetrievalContext) -
          // putting them last *inside* the system block did not help, because
          // the cache breakpoint sits at the end of that block and therefore
          // after them.
        );

        const IMAGE_TOOL: Record<string, Tool> =
          useImageTool && toolChoice !== "none"
            ? {
                [ImageToolName]: createImageTool(
                  customerId,
                  id,
                  entityId,
                  imageTool?.model,
                  imageTool?.mask,
                ),
              }
            : {};

        // Void Motion (§3.7): same chat UI — the prompt carries the clip
        // length and dimensions, the finished MP4 lands in the thread.
        const VIDEO_TOOL: Record<string, Tool> =
          process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
          isToolCallAllowed &&
          (!allowedAppDefaultToolkit?.length ||
            allowedAppDefaultToolkit.includes("video-generation"))
            ? { [VideoToolName]: createVideoTool(customerId, id) }
            : {};

        // Void Memory (§3.3): the agent proposes record changes; the user
        // approves them in the Void Memory page before they take effect.
        const MEMORY_RECORD_TOOL: Record<string, Tool> = isToolCallAllowed
          ? {
              [MemoryRecordToolName]: createMemoryRecordTool(
                session.user.id,
                thread?.projectId ?? null,
              ),
            }
          : {};
        // Expose loadSkill only when the Auto catalog is non-empty — the model
        // needs the catalog (with ids) to call it meaningfully.
        const SKILL_TOOLS: Record<string, Tool> =
          isToolCallAllowed && skillCatalogPrompt
            ? {
                [LoadSkillToolName]: createLoadSkillTool(
                  session.user.id,
                  activeOrganizationId,
                ),
              }
            : {};
        // Publishing writes a row and returns a link, so it is bound whenever
        // tool calls are allowed at all — it has no toolkit to be switched off
        // with and no browser round trip.
        const PUBLISH_TOOL: Record<string, Tool> = isToolCallAllowed
          ? {
              [PublishPageToolName]: createPublishPageTool(
                session.user.id,
                activeOrganizationId,
                thread?.id,
              ),
            }
          : {};

        // Plan mode's entire tool surface: parallel research subagents plus
        // the plan artifact. HITL tools are excluded with the rest — nothing
        // is executed in plan mode, so there is nothing to approve.
        const PLAN_TOOLS: Record<string, Tool> = planModeActive
          ? {
              [ResearchToolName]: createResearchAgentTool({
                model,
                customerId: customerId ?? undefined,
                entityId,
                projectId: thread?.projectId ?? undefined,
                organizationId: activeOrganizationId ?? undefined,
                threadId: id,
                modelId: chatModel
                  ? `${chatModel.provider}/${chatModel.model}`
                  : undefined,
              }),
              [DefaultToolName.CreatePlan]: createPlanTool,
            }
          : {};

        // Void Orchestrator (§3.2/§3.4, Stage 06): role-scoped parallel
        // workers — 06A Research & Inspect, 06B Build & Modify, 06C Test &
        // Analyze — with a verification gate. Bound for every tool-allowed
        // chat (not plan-gated): the fan-out IS the execution stage.
        const ORCHESTRATOR_TOOL: Record<string, Tool> = isToolCallAllowed
          ? {
              [OrchestratorToolName]: createOrchestratorTool({
                model,
                userId: session.user.id,
                customerId: customerId ?? undefined,
                entityId,
                projectId: thread?.projectId ?? undefined,
                organizationId: activeOrganizationId ?? undefined,
                threadId: id,
                modelId: chatModel
                  ? `${chatModel.provider}/${chatModel.model}`
                  : undefined,
              }),
            }
          : {};

        // Browser automation is bound here rather than in the toolkit map: it
        // drives an inner agent and so needs the request's resolved model, the
        // same reason the research subagent is bound here.
        // A `@browser-automation` pin has to count as the toolkit being on —
        // see `lib/chat/browser-tool-pin` for why naming the tool used to be
        // what removed it.
        const browserToolkitOn = isBrowserToolkitOn({
          mentions,
          allowedAppDefaultToolkit: runAllowedAppDefaultToolkit,
        });
        // `unattendedContext` is loaded above the tool loaders — see the
        // Cloud Agent toolkit note there.

        // Several independent gates collapse into one absent tool, which has
        // already cost a debugging session — name the first gate that failed
        // so "why is browser automation missing?" is answerable from one log
        // line. Ordering and reasons live in `lib/chat/browser-tool-gate` so
        // they can be tested; the org policy read only runs when every cheap
        // check passed.
        // Provider chain (B20, isolated-first): Kernel (cloud, metered) ->
        // self-hosted Steel (free, single concurrent session, sidecar code
        // executor) -> the open-source agent-browser CLI (free, local, one
        // command per step). A candidate binds ONLY when its egress boundary
        // is configured (see lib/browser-egress/capability.ts) — a provider
        // configured without isolation is skipped and the gate names the fix.
        // Among isolated candidates Kernel wins: it is the only one with a
        // live view, the credential vault's profile persistence and CAPTCHA
        // solving.
        const kernelBrowserConfigured = IS_KERNEL_CONFIGURED;
        const steelProvider = createSteelBrowserProvider();
        const agentBrowserReady = isAgentBrowserConfigured();
        const selectedBrowserProvider = selectIsolatedBrowserProvider({
          kernelConfigured: kernelBrowserConfigured,
          steelConfigured: steelProvider !== null,
          agentBrowserConfigured: agentBrowserReady,
        });
        const browserGateInput = {
          planModeActive,
          unattended: isUnattendedRun,
          providerConfigured:
            kernelBrowserConfigured ||
            steelProvider !== null ||
            agentBrowserReady,
          selectedProvider: selectedBrowserProvider.provider,
          egressSkippedBy: selectedBrowserProvider.skippedBy,
          toolkitOn: browserToolkitOn,
          taskBrowserEnabled: unattendedContext.browserAutomationEnabled,
        };
        const browserPolicyGate = shouldReadBrowserPolicy(browserGateInput)
          ? await (isUnattendedRun
              ? resolveUnattendedBrowserGate
              : resolveBrowserAutomationGate)({
              organizationId: activeOrganizationId,
              userId: session.user.id,
            })
          : null;
        const browserToolSuppressedBy = resolveBrowserToolSuppression({
          ...browserGateInput,
          policyGate: browserPolicyGate,
        });
        if (browserToolSuppressedBy && isToolCallAllowed) {
          logger.info(
            `browser-automation tool not bound: ${browserToolSuppressedBy}`,
          );
        }
        // Which stored sign-ins this run may use. An unattended run gets only
        // the aliases a human pinned to its schedule; an interactive one gets
        // the org's, because a person is present and chose to run the tool.
        // Resolved (a Scaleway read per credential) only when the tool is
        // actually bound.
        const browserCredentials =
          browserToolSuppressedBy === null
            ? await resolveBrowserCredentials({
                organizationId: activeOrganizationId,
                aliases: isUnattendedRun
                  ? unattendedContext.credentialAliases
                  : await browserCredentialRepository
                      .selectAliasesForOrganization(activeOrganizationId ?? "")
                      .catch(() => []),
              })
            : [];

        const BROWSER_TOOL: Record<string, Tool> =
          browserToolSuppressedBy === null &&
          selectedBrowserProvider.provider === "kernel"
            ? {
                [DefaultToolName.BrowserAutomation]:
                  createBrowserAutomationTool({
                    model,
                    customerId: customerId ?? undefined,
                    entityId,
                    organizationId: activeOrganizationId ?? undefined,
                    threadId: id,
                    modelId: chatModel
                      ? `${chatModel.provider}/${chatModel.model}`
                      : undefined,
                    unattended: isUnattendedRun,
                    credentials: browserCredentials,
                    // Read back off the terminal `finish` frame by the
                    // scheduled-task runner, which is what turns "the page
                    // needed a person" into a recorded failure instead of a
                    // silent success.
                    onRunBlocked: (block) => {
                      metadata.blocked = block;
                    },
                    onCredentialUsed: (aliases) => {
                      if (!activeOrganizationId) return;
                      void browserCredentialRepository
                        .touchLastUsed(activeOrganizationId, aliases)
                        .catch(() => {
                          // Best-effort bookkeeping; never fail a run for it.
                        });
                    },
                  }),
              }
            : browserToolSuppressedBy === null &&
                selectedBrowserProvider.provider === "steel"
              ? {
                  [DefaultToolName.BrowserAutomation]:
                    createBrowserAutomationTool({
                      model,
                      customerId: customerId ?? undefined,
                      entityId,
                      organizationId: activeOrganizationId ?? undefined,
                      threadId: id,
                      modelId: chatModel
                        ? `${chatModel.provider}/${chatModel.model}`
                        : undefined,
                      unattended: isUnattendedRun,
                      // steelProvider is `BrowserProvider | null` (null =
                      // unconfigured); the tool's prop is optional/undefined-
                      // able, so fold null into "no provider" (default
                      // behavior) instead of failing the build's type check.
                      provider: steelProvider ?? undefined,
                      credentials: browserCredentials,
                      // Same terminal-frame reader as the Kernel path: a
                      // scheduled run whose page demanded a person is a
                      // recorded failure, not a silent success.
                      onRunBlocked: (block) => {
                        metadata.blocked = block;
                      },
                      onCredentialUsed: (aliases) => {
                        if (!activeOrganizationId) return;
                        void browserCredentialRepository
                          .touchLastUsed(activeOrganizationId, aliases)
                          .catch(() => {
                            // Best-effort bookkeeping; never fail a run.
                          });
                      },
                    }),
                }
              : browserToolSuppressedBy === null &&
                  selectedBrowserProvider.provider === "agent-browser"
                ? {
                    [DefaultToolName.BrowserAutomation]:
                      createAgentBrowserAutomationTool({
                        model,
                        customerId: customerId ?? undefined,
                        entityId,
                        organizationId: activeOrganizationId ?? undefined,
                        threadId: id,
                        modelId: chatModel
                          ? `${chatModel.provider}/${chatModel.model}`
                          : undefined,
                        unattended: isUnattendedRun,
                        // Same terminal-frame reader as the Kernel path: a
                        // scheduled run whose page demanded a person is a
                        // recorded failure, not a silent success.
                        onRunBlocked: (block) => {
                          metadata.blocked = block;
                        },
                      }),
                  }
                : {};

        const availableTools: Record<string, Tool> = {
          ...MCP_TOOLS,
          ...WORKFLOW_TOOLS,
          ...(planModeActive ? {} : HITL_TOOLS),
          ...APP_DEFAULT_TOOLS,
          ...SKILL_TOOLS,
          ...IMAGE_TOOL,
          ...VIDEO_TOOL,
          ...MEMORY_RECORD_TOOL,
          ...PUBLISH_TOOL,
          ...PLAN_TOOLS,
          ...ORCHESTRATOR_TOOL,
          ...BROWSER_TOOL,
        };
        // Composio is the fallback family (see COMPOSIO_FALLBACK_SYSTEM_PROMPT):
        // it binds last so its meta-tools sit at the bottom of the tool list,
        // and it can never shadow a first-party tool on a name collision.
        for (const [name, composioTool] of Object.entries(COMPOSIO_TOOLS)) {
          if (!(name in availableTools)) availableTools[name] = composioTool;
        }
        // `manual` keeps the model's ability to request a tool, but removes
        // every execute callback until the existing confirmation flow supplies
        // a result. `none` is an actual no-tools mode, even with mentions.
        // Plan mode overrides both: its two tools always auto-execute.
        const vercelAITooles: Record<string, Tool> = planModeActive
          ? availableTools
          : toolChoice === "none"
            ? {}
            : toolChoice === "manual"
              ? excludeToolExecution(availableTools)
              : availableTools;
        metadata.toolCount = Object.keys(vercelAITooles).length;

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t) => t.tools)
          .flat();

        logger.info(
          `${agent ? `agent: ${agent.name}, ` : ""}tool mode: ${toolChoice}, mentions: ${mentions.length}`,
        );

        // Names, not just counts: answering "was web search even offered?"
        // from counts alone requires reconstructing it from the tool registry.
        logger.info(
          `allowedMcpTools: ${allowedMcpTools.length ?? 0}, allowedAppDefaultToolkit: ${runAllowedAppDefaultToolkit?.length ?? 0} [${(runAllowedAppDefaultToolkit ?? []).join(", ")}]`,
        );
        if (useImageTool) {
          logger.info(
            `binding tool count Image: ${imageTool?.model ?? "auto"}${imageTool?.mask ? " (masked)" : ""}`,
          );
        } else {
          // Composio tools are loaded dynamically by the Tool Router, so the
          // names are the only way to tell afterwards whether a connected app
          // offered a competing search/code tool alongside our own.
          const composioToolNames = Object.keys(COMPOSIO_TOOLS ?? {});
          logger.info(
            `binding tool count APP_DEFAULT: ${Object.keys(APP_DEFAULT_TOOLS ?? {}).length}, MCP: ${Object.keys(MCP_TOOLS ?? {}).length}, Workflow: ${Object.keys(WORKFLOW_TOOLS ?? {}).length}, Composio: ${composioToolNames.length} [${composioToolNames.slice(0, 15).join(", ")}${composioToolNames.length > 15 ? ", …" : ""}]`,
          );
        }
        logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);

        // ========== ALL MODELS: Use standard streaming ==========
        // Local Models already configured in models.ts to use /v1/chat/completions
        const modelMessages = await timer.track("convertMessages", () =>
          convertToModelMessages(
            // Send-time only: strips bulky tool output and ingestion previews
            // out of turns the model has already acted on. The persisted
            // transcript and the UI keep the full content.
            slimHistoryForModel(messages),
            {
              // A disconnected legacy viewer can leave a tool part half-written.
              // Keep the durable transcript, but do not make a later turn fail
              // conversion because that incomplete call has no result.
              ignoreIncompleteToolCalls: true,
            },
          ),
        );

        // Boundary between server-side work and the model call. Combined with
        // ttftMs in the flush, this isolates pure gateway + provider latency.
        timer.beforeModel();

        // Compaction budget for this request. A flat token threshold was wrong
        // in both directions: a 40k-window model dies at the provider before
        // reaching it, a 400k-window one gives up context it still had room
        // for. Models outside the catalog (Local, openai-compatible) fall back
        // low rather than high - the cost of guessing high is the whole turn.
        // Mutable refs: a mid-stream fallback attempt recomputes them for the
        // attempt's own model, so prepareStep compacts against the window the
        // retry is actually running on.
        let contextWindowRef =
          getContextWindow(chatModel) ?? FALLBACK_CONTEXT_WINDOW;
        let compactAtTokensRef = Math.floor(
          contextWindowRef * COMPACT_AT_CONTEXT_FRACTION,
        );
        // Ordinal of the attempt currently being pumped. onError's deferred
        // terminal handling compares against it so a stale timer from a
        // discarded retry attempt cannot touch the run's terminal state.
        let attemptOrdinalRef = 0;

        const baseStreamOptions = {
          model,
          // Passed as a system message rather than a string so the cache
          // breakpoint can be attached (see prompt-cache.ts).
          system: {
            role: "system",
            content: systemPrompt,
            providerOptions: ANTHROPIC_CACHE_CONTROL,
          },
          ...(typeof model === "string" &&
          (gatewayFallbacks.length > 0 || Object.keys(gatewayByok).length > 0)
            ? {
                providerOptions: {
                  gateway: {
                    ...(gatewayFallbacks.length > 0
                      ? {
                          models: gatewayFallbacks.map(
                            ({ modelId }) => modelId,
                          ),
                        }
                      : {}),
                    ...(Object.keys(gatewayByok).length > 0
                      ? { byok: gatewayByok }
                      : {}),
                  },
                },
              }
            : {}),
          // Breakpoint first, retrieval context second: the context is not
          // persisted, so the cached span has to end at the user's real
          // question to still match on the next turn.
          messages: appendRetrievalContext(
            withTrailingCacheBreakpoint(modelMessages),
            [
              agentKnowledgePrompt,
              projectRetrievalPrompt,
              sandboxAssetsPrompt,
              buildCurrentDateTimePrompt(),
            ],
          ),
          experimental_telemetry: aiTelemetry("chat.stream", {
            organizationId: activeOrganizationId,
            threadId: id,
            agentId: agent?.id,
            provider: chatModel?.provider,
            modelId: chatModel?.model,
            toolCount: Object.keys(vercelAITooles ?? {}).length,
          }),
          prepareStep: ({ initialMessages, responseMessages, steps }) => {
            // Logged before anything can throw in here. Its absence before a
            // missing step is the difference between "the next step never
            // started" and "the step ran and its log was dropped".
            logger.info(
              `[chat] step=${steps.length} starting, ${responseMessages.length} loop messages`,
            );
            // A single turn can run up to 10 steps, each re-sending everything
            // the loop accumulated so far. Past the threshold, drop tool
            // payloads from all but the most recent loop messages.
            //
            // The provider already measured the last prompt, so use that
            // instead of a JSON estimate: `inputTokens` is the total prompt
            // including cache reads, which is what has to fit in the window.
            // Step 0 has no usage yet, hence the fallback.
            const lastUsage = steps.at(-1)?.usage;
            const used =
              lastUsage?.inputTokens != null
                ? lastUsage.inputTokens + (lastUsage.outputTokens ?? 0)
                : estimateTokens([...initialMessages, ...responseMessages]);
            if (used <= compactAtTokensRef) return;

            const compacted = compactLoopMessages(responseMessages);
            if (!compacted) return;

            logger.info(
              `compacting step context: ${responseMessages.length} loop messages -> ${compacted.length}, ~${Math.round(used / 1000)}k of ${Math.round(contextWindowRef / 1000)}k window`,
            );

            // Rebuilt from `initialMessages` rather than from the carried-
            // forward step messages: the conversation - and both cache
            // breakpoints, which sit inside it - stays byte-stable for the
            // whole turn, and re-compacting a later step cannot compound.
            return { messages: [...initialMessages, ...compacted] };
          },
          // Server-owned abort. Without Redis it tracks request.signal
          // (viewer-bound: tab close / stop halts the run, onAbort persists the
          // partial as "cancelled"). With Redis it is driven only by the
          // detached stop flag, so generation survives a closed tab and keeps
          // buffering to the resumable stream.
          abortSignal: abortController.signal,
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 0, // Disable retries for faster response (gateway handles failover)
          tools: vercelAITooles,
          stopWhen: stepCountIs(10),
          toolChoice:
            toolChoice === "none" && !planModeActive ? "none" : "auto",
          // A tool name the model got slightly wrong costs a whole step: the
          // SDK cannot resolve it, the step returns a `tool-error` instead of a
          // result, and the model re-emits it against the step budget. The
          // Kimi line sends its wire-format namespace, which the gateway
          // flattens to `functions_COMPOSIO_SEARCH_TOOLS`. `repairToolName` only ever
          // returns a name that is already bound, so this cannot reach a tool
          // the model was not offered.
          experimental_repairToolCall: async ({ toolCall }) => {
            const boundNames = Object.keys(vercelAITooles);
            const repaired = repairToolName(boundNames, toolCall.toolName);
            // Bad arguments land here too. The name resolving to itself means
            // the call failed for some other reason, which is not ours to fix.
            if (repaired === toolCall.toolName) return null;
            if (!repaired) {
              logger.warn(
                `[chat] unresolvable tool call "${toolCall.toolName}" against ${boundNames.length} bound tools`,
              );
              return null;
            }
            logger.warn(
              `[chat] repaired tool call "${toolCall.toolName}" -> "${repaired}"`,
            );
            // Spread rather than rebuild: only the name is wrong, and the rest
            // of the call is whatever shape this SDK version uses.
            return { ...toolCall, toolName: repaired };
          },
          // These nest: a step cannot outlive the total, and the total must
          // finish inside maxDuration with time left to persist. stepMs used to
          // be 120s — half the total — which capped a single-step reasoning
          // answer at two minutes and made the rest of the budget unreachable.
          // Turns were dying mid-reasoning at ~127s with an already-200 stream,
          // so the UI just stopped.
          //
          // chunkMs was 45s on the assumption that reasoning always streams
          // deltas, so a 45s gap meant a dead connection. It does not hold for
          // every provider: TensorX/kimi-k3 went silent for >45s while
          // composing a large tool call (trace fd0141e9…, 2026-09-08) and the
          // run was killed 124s into a step that was still producing. A real
          // stall is now bounded by stepMs instead of being detected early;
          // that costs a spinner on a rare dead socket, where the old value
          // cost the answer on a healthy one.
          //
          // toolMs bounds a server-executed tool call; the headless code tool
          // runs for up to 90s plus sandbox creation and artifact upload.
          timeout: {
            totalMs: CHAT_TOTAL_MS,
            stepMs: CHAT_STEP_MS,
            chunkMs: Math.min(180_000, CHAT_STEP_MS),
            toolMs: SERVER_TOOL_STEP_BUDGET_MS,
          },
          // First model output chunk → time-to-first-token. The gap between
          // preStreamMs (sum of blocking stages) and ttftMs is gateway +
          // provider latency.
          onChunk: ({ chunk }) => {
            if (
              chunk.type === "text-delta" ||
              chunk.type === "reasoning-delta"
            ) {
              timer.firstToken();
            }
          },
          onError: ({ error }) => {
            const isTimeout =
              error instanceof Error && error.name === "TimeoutError";
            logger.error(
              `AI SDK stream error [${
                error instanceof Error ? error.name : "UnknownError"
              }]${isTimeout ? " (timeout scope: total/step/chunk/tool)" : ""}`,
              error,
            );
            // The mid-stream fallback probe reads the error frame BEFORE the
            // retry decision, so terminal side effects are deferred one tick
            // and gated by attempt ordinal: a discarded attempt must not fail
            // the run, release the budget reservation (the replacement
            // attempt reuses it) or flush the latency timer — and a stale
            // deferred timer from a discarded attempt is a no-op even when it
            // lands during the replacement attempt's probe.
            const ordinal = attemptOrdinalRef;
            setTimeout(() => {
              if (ordinal !== attemptOrdinalRef) return;
              clearStopPoll();
              // Unguarded, this is an unhandled rejection: the helper opens an
              // advisory-locked transaction against a pool whose default size is
              // 1, so a checkout timeout here would kill the instance mid-run —
              // taking the terminal write and the buffered logs with it.
              void releaseMemberBudget(budgetReservationId).catch((err) =>
                logger.warn("Failed to release the member budget", err),
              );
              metadata.runStatus = isTimeout ? "timed_out" : "failed";
              metadata.error = {
                code: isTimeout ? "timeout" : "stream_error",
                retryable: true,
              };
              // The only other flush sites are onEnd, onAbort and the outer
              // catch, so a run that errored used to emit no LatencyTimer at
              // all — which reads in the logs exactly like a run that vanished.
              timer.flush({
                error: error instanceof Error ? error.name : "UnknownError",
                provider: attemptChatModelRef?.provider,
                model: attemptChatModelRef?.model,
                userId: session.user.id,
                threadId: thread?.id,
              });
            }, 0);
          },
          onAbort: (event) => {
            // Discarded retry attempts were cancelled, not aborted by the
            // user; the replacement attempt owns terminal handling.
            if (attemptDiscarded) return;
            const { steps } = event;
            // ai@7.0.18 passes the abort signal's `reason` on this event but
            // does not declare it on the callback type yet.
            const reason = (event as { reason?: unknown }).reason;
            clearStopPoll();
            runDeadline?.clear();
            // Guarded for the same reason as in onError above.
            void releaseMemberBudget(budgetReservationId).catch((error) =>
              logger.warn("Failed to release the member budget", error),
            );
            metadata.lastCompletedStep =
              steps.length > 0 ? steps.length - 1 : undefined;
            // A stop the user asked for and a budget that quietly ran out land
            // in the same callback. Only the first is a "cancelled" run; the
            // SDK's step/chunk/total timeouts arrive here too (through the
            // merged abort signal, `reason` carrying the TimeoutError) and are
            // persisted as "timed_out" so the UI does not claim the user
            // stopped it. The stream is already a 200 by then, so the client
            // only ever learns this from the persisted status.
            const outcome = resolveAbortOutcome({
              userStopped: stopRequestedAt !== null,
              reason,
            });
            metadata.runStatus = outcome.runStatus;
            metadata.error = outcome.error;
            if (outcome.detail) {
              logger.error(
                `AI SDK run aborted without a stop request — completed steps: ${steps.length}. ${outcome.detail}`,
              );
            }
            timer.flush({
              aborted: true,
              provider: attemptChatModelRef?.provider,
              model: attemptChatModelRef?.model,
              userId: session.user.id,
              threadId: thread?.id,
            });
          },
          // Tool-loop trace. A step ending `finishReason: "tool-calls"` with no
          // following step means the loop stopped waiting on a client-side tool
          // (one declared without `execute`, e.g. e2b-sandbox) whose result the
          // browser never sent back — indistinguishable from a hang without
          // this line. `onStepFinish` is the deprecated alias for it; this
          // call passed both until now, which silently dropped one of them.
          onStepEnd: ({ stepNumber, toolCalls, toolResults, finishReason }) => {
            metadata.lastCompletedStep = stepNumber;
            logger.info(
              `[chat] step=${stepNumber} finishReason=${finishReason} calls=${
                toolCalls?.map((c) => c.toolName).join(",") || "none"
              } results=${toolResults?.length ?? 0} threadId=${thread?.id ?? "n/a"}`,
            );
          },
          onEnd: async ({
            usage,
            finishReason,
            rawFinishReason,
            warnings,
            stepNumber,
            finalStep,
            steps,
          }) => {
            // Only the surviving attempt may finalize: a discarded attempt's
            // stream was cancelled before producing content, so its billing,
            // usage attribution and run-status writes belong to nobody.
            if (attemptDiscarded) return;
            clearStopPoll();
            const gatewayCandidate = findGatewayFallbackCandidate({
              providerMetadata: finalStep.providerMetadata,
              candidates: [
                ...(resolvedCandidate ? [resolvedCandidate] : []),
                ...gatewayFallbacks.map(({ candidate }) => candidate),
              ],
            });
            if (
              gatewayCandidate &&
              resolvedCandidate &&
              gatewayCandidate.deploymentId !== resolvedCandidate.deploymentId
            ) {
              logger.warn(
                `[chat] AI Gateway used configured fallback ${gatewayCandidate.chatModel.provider}/${gatewayCandidate.chatModel.model}`,
              );
              resolvedCandidate = gatewayCandidate;
              chatModel = gatewayCandidate.chatModel;
              metadata.chatModel = chatModel;
              metadata.routing = {
                ...metadata.routing,
                automatic: metadata.routing?.automatic ?? false,
                reasonCode: "gateway_model_fallback",
              };
            }
            if (metadata.runStatus === "running") {
              // The SDK already tells us WHY generation stopped. Surface
              // truncation/content-filter as "incomplete" instead of flattening
              // every non-error finish into "completed", so the UI can offer to
              // continue. (Announce-and-stop dead-ends finish as "stop" and are
              // addressed by the tool-usage prompt, not here.)
              metadata.runStatus =
                finishReason === "error"
                  ? "failed"
                  : finishReason === "length" ||
                      finishReason === "content-filter"
                    ? "incomplete"
                    : "completed";
            }
            metadata.finishReason = finishReason;
            metadata.rawFinishReason = rawFinishReason
              ? String(rawFinishReason)
              : undefined;
            metadata.warnings = (warnings ?? []).map((warning) =>
              String((warning as { type?: string }).type ?? "provider_warning"),
            );
            metadata.lastCompletedStep = stepNumber;
            const usageGroups = primaryRoutingCandidate
              ? groupGatewayStepUsage({
                  steps,
                  candidates: [
                    primaryRoutingCandidate,
                    ...gatewayFallbacks.map(({ candidate }) => candidate),
                  ],
                  defaultCandidate: primaryRoutingCandidate,
                })
              : [];
            if (usageGroups.length > 0 && primaryRoutingCandidate) {
              await finalizeMemberBudget({
                reservationId: budgetReservationId,
                actualMicros: usageGroups.reduce(
                  (total, group) =>
                    total +
                    estimateCostMicros({
                      inputTokens: group.inputTokens,
                      outputTokens: group.outputTokens,
                      candidate: group.candidate,
                      cacheReadTokens: group.cacheReadTokens,
                      cacheWriteTokens: group.cacheWriteTokens,
                      noCacheTokens: group.noCacheTokens,
                    }),
                  0,
                ),
              });
            } else {
              await releaseMemberBudget(budgetReservationId);
            }
            timer.flush({
              provider: chatModel?.provider,
              model: chatModel?.model,
              userId: session.user.id,
              threadId: thread?.id,
            });
            // Access is billed through the flat Local Models add-on. The
            // customer-hosted inference itself does not consume total credits.
            if (chatModel?.provider === "Local Models") {
              logger.info(
                `[Local Models] Subscription entitlement verified; no metered token deduction`,
              );
              return;
            }

            // Track usage by the model that actually served each Gateway
            // step. A tool loop may use a fallback on one step and the primary
            // on another, so a single turn-level model label is not enough.
            if (usageGroups.length > 0) {
              logger.info(
                `[billing] Processing token usage across ${usageGroups.length} model(s)`,
              );

              // Local Models are subscription-gated, not usage-metered.
              if (chatModel?.provider !== "Local Models") {
                try {
                  for (const group of usageGroups) {
                    if (group.inputTokens + group.outputTokens <= 0) continue;
                    await trackUsage({
                      kind: "tokens",
                      customerId,
                      entityId,
                      modelId: `${group.candidate.chatModel.provider}/${group.candidate.chatModel.model}`,
                      promptTokens: group.inputTokens,
                      completionTokens: group.outputTokens,
                      cacheReadTokens: group.cacheReadTokens || undefined,
                      cacheWriteTokens: group.cacheWriteTokens || undefined,
                      noCacheTokens: group.noCacheTokens || undefined,
                      idempotencyKey: billingRunKey({
                        scope: "chat",
                        subject: customerId ?? session.user.id,
                        detail: `${message.id}:${group.candidate.deploymentId}`,
                        runId,
                      }),
                      properties: {
                        threadId: thread?.id,
                        userId: session.user.id,
                        ...(memberId ? { memberId } : {}),
                      },
                    });
                  }
                  logger.info("[billing] Token usage tracked successfully");
                } catch (err) {
                  logger.error("[billing] Failed to track usage:", err);
                }
              } else {
                logger.info(
                  `[billing] Local Models covered by subscription entitlement`,
                );
              }
            } else {
              if (
                usage?.totalTokens &&
                usage.inputTokens &&
                usage.outputTokens &&
                chatModel
              ) {
                try {
                  await trackUsage({
                    kind: "tokens",
                    customerId,
                    entityId,
                    modelId: `${chatModel.provider}/${chatModel.model}`,
                    promptTokens: usage.inputTokens,
                    completionTokens: usage.outputTokens,
                    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
                    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
                    noCacheTokens: usage.inputTokenDetails?.noCacheTokens,
                    idempotencyKey: billingRunKey({
                      scope: "chat",
                      subject: customerId ?? session.user.id,
                      detail: message.id,
                      runId,
                    }),
                    properties: {
                      threadId: thread?.id,
                      userId: session.user.id,
                      ...(memberId ? { memberId } : {}),
                    },
                  });
                } catch (err) {
                  logger.error("[billing] Failed to track token usage", err);
                }
                // Void Devices quota counter (Agent tokens / week).
                void planUsageRepository.increment(
                  session.user.id,
                  "agent_tokens",
                  weekKey(),
                  (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                );
              } else {
                logger.warn(
                  "[billing] Incomplete usage data - cannot calculate user tokens",
                  { usage },
                );
              }
            }
          },
        } satisfies Parameters<typeof streamText>[0];

        // ---- Mid-stream fallback retry (master prompt §3.1) ----
        // AI SDK streams are append-only once merged into dataStream, so the
        // only safe retry boundary is BEFORE the first UI chunk: probe the
        // first frames on a tee'd branch. A model that errors before emitting
        // any content has shown nothing, run no tool, and persisted nothing —
        // discard it and retry on the next validated fallback candidate.
        // Once content started the merge proceeds unchanged; post-output
        // retry would duplicate text and repeat tool side effects.
        let activeChatAttempt = 0;
        let attemptDiscarded = false;
        let attemptModelRef: typeof model = model;
        let attemptChatModelRef: typeof chatModel = chatModel;
        const buildStreamOptions = () => ({
          ...baseStreamOptions,
          // The instance must be per-attempt; telemetry re-reports the model
          // the attempt is actually running on.
          model: attemptModelRef,
          experimental_telemetry: aiTelemetry("chat.stream", {
            organizationId: activeOrganizationId,
            threadId: id,
            agentId: agent?.id,
            provider: attemptChatModelRef?.provider,
            modelId: attemptChatModelRef?.model,
            toolCount: Object.keys(vercelAITooles ?? {}).length,
          }),
        });
        let attemptCandidate = resolvedCandidate;
        let streamResult = streamText(buildStreamOptions());
        let [probedStream, probeMirror] = streamResult.stream.tee();
        let verdict = await probeStreamViability(probeMirror);
        for (const fallbackCandidate of streamFallbacks) {
          if (verdict !== "failed-before-output") break;
          let nextModel: typeof model;
          try {
            nextModel = await getModelInstance(
              fallbackCandidate.chatModel,
              session.user.id,
            );
            if (nextModel === model) continue;
          } catch (error) {
            logger.warn(
              `[chat] skipping unavailable mid-stream fallback ${fallbackCandidate.chatModel.provider}/${fallbackCandidate.chatModel.model}`,
              error,
            );
            continue;
          }
          // Discard the failed attempt: mark it stale first so its terminal
          // callbacks become no-ops, then cancel both tee branches.
          attemptDiscarded = true;
          await probedStream.cancel().catch(() => {});
          activeChatAttempt += 1;
          attemptOrdinalRef = activeChatAttempt;
          attemptModelRef = nextModel;
          const fallbackChatModel = fallbackCandidate.chatModel;
          attemptChatModelRef = fallbackChatModel;
          attemptCandidate = fallbackCandidate;
          contextWindowRef =
            getContextWindow(fallbackChatModel) ?? FALLBACK_CONTEXT_WINDOW;
          compactAtTokensRef = Math.floor(
            contextWindowRef * COMPACT_AT_CONTEXT_FRACTION,
          );
          streamResult = streamText(buildStreamOptions());
          [probedStream, probeMirror] = streamResult.stream.tee();
          attemptDiscarded = false;
          verdict = await probeStreamViability(probeMirror);
          logger.warn(
            `[chat] mid-stream fallback attempt ${activeChatAttempt}: retrying on ${fallbackChatModel.provider}/${fallbackChatModel.model}`,
          );
        }
        // Attribution mirrors the Gateway swap: flip the request-level model
        // only for a retry that actually produced output; billing keeps the
        // primary candidate as the conservative bound either way.
        if (activeChatAttempt > 0) {
          if (verdict !== "failed-before-output") {
            chatModel = attemptChatModelRef;
            resolvedCandidate = attemptCandidate;
            metadata.chatModel = chatModel;
            metadata.routing = {
              ...metadata.routing,
              automatic: false,
              reasonCode: "stream_model_fallback",
            };
            logger.info(
              `[chat] mid-stream fallback applied: ${chatModel?.provider}/${chatModel?.model}`,
            );
          } else {
            logger.warn(
              `[chat] mid-stream fallback chain exhausted after ${activeChatAttempt} attempt(s)`,
            );
          }
        }
        streamResult.consumeStream();
        dataStream.merge(
          toUIMessageStream({
            stream: probedStream,
            tools: vercelAITooles,
            sendSources: true,
            // The default replaces every model error with "An error occurred.";
            // handleError returns fixed, user-facing text instead (never the
            // raw error), so a refused model can say why.
            onError: handleError,
            messageMetadata: ({ part }) => {
              if (part.type == "finish") {
                metadata.usage = part.totalUsage;
                return metadata;
              }
            },
          }),
        );
      },

      generateId: generateUUID,
      onEnd: async ({ responseMessage }) => {
        runDeadline?.clear();
        // Terminal point of the whole stream: stop polling and release the
        // thread's Redis pointer + stop flag (buffered chunks self-expire).
        clearStopPoll();
        if (resumeEnabled) {
          await Promise.allSettled([clearActiveStream(id), clearStop(id)]);
        }
        // Keep IDs and generated output stable across a persistence retry. A
        // database retry must never repeat model generation or tool effects.
        const assistantMessageId =
          responseMessage.id === message.id
            ? generateUUID()
            : responseMessage.id;
        const persistedUserMessage = {
          threadId: thread!.id,
          role: message.role,
          parts: message.parts.map(convertToSavePart),
          id: message.id,
          metadata: {
            ...initialMessageMetadata,
            runStatus: metadata.runStatus,
            ...(metadata.error ? { error: metadata.error } : {}),
          },
        };
        const persistedAssistantMessage = {
          threadId: thread!.id,
          role: responseMessage.role,
          id: assistantMessageId,
          parts: responseMessage.parts.map(convertToSavePart),
          metadata,
        };
        const finalized = await finalizeChatRunWithRecovery({
          metadata,
          finalize: async () => {
            if (message.role === "user") {
              await chatRepository.finalizeMessageRun(
                persistedUserMessage,
                persistedAssistantMessage,
              );
              return;
            }
            await chatRepository.upsertMessage(persistedUserMessage);
            await chatRepository.upsertMessage(persistedAssistantMessage);
          },
          persistFailure: (failedMetadata) => {
            const failedMessage = {
              ...persistedUserMessage,
              metadata: failedMetadata,
            };
            return message.role === "user"
              ? chatRepository.failMessageRun(failedMessage)
              : chatRepository.upsertMessage(failedMessage);
          },
          onFinalizationError: (error, attempt) =>
            logger.error(
              attempt === 1
                ? "Could not persist completed chat run; retrying the same output"
                : "Could not persist completed chat run after one retry",
              error,
            ),
          onPersistenceError: (error) =>
            logger.error(
              "Could not persist non-retryable state after chat finalization failure",
              error,
            ),
        });
        if (!finalized) {
          if (resumeEnabled) {
            await Promise.allSettled([clearActiveStream(id), clearStop(id)]);
          }
          return;
        }

        // Titling is normally kicked off by the client once the stream ends,
        // but a closed tab, a navigation, or a failed request left the thread
        // untitled forever — the sidebar shows "New Chat" and nothing retries.
        // after() runs once the response is flushed, so this adds no latency to
        // the answer, and setThreadTitleIfEmpty makes the first write win if the
        // client is titling concurrently.
        if (!thread!.title?.trim()) {
          const titleSeed = buildThreadTitleSeed([message, responseMessage]);
          if (titleSeed) {
            // Titling is best effort and must never take the answer down with
            // it, so even scheduling it is guarded.
            try {
              after(async () => {
                try {
                  const current = await chatRepository.selectThread(id);
                  if (current?.title?.trim()) return;
                  const title = await generateThreadTitle({
                    seed: titleSeed,
                    telemetryId: "chat.title.fallback",
                    telemetryMetadata: { threadId: id },
                  });
                  await chatRepository.setThreadTitleIfEmpty(id, title);
                } catch (error) {
                  logger.error("Failed to backfill thread title", error);
                }
              });
            } catch (error) {
              logger.error("Failed to schedule thread titling", error);
            }
          }
        }

        // A project's brain learns from its chats. One run per thread per
        // window keeps a lively conversation from paying for an extraction on
        // every turn; the run reads the whole thread, so nothing is lost.
        const brainProjectId = thread?.projectId;
        if (brainProjectId && metadata.runStatus !== "failed") {
          try {
            after(async () => {
              try {
                await enqueueProjectBrainRun({
                  projectId: brainProjectId,
                  actorUserId: session.user.id,
                  sourceType: "chat",
                  sourceRef: id,
                  sourceScope: `chat:${id}`,
                  trigger: "chat_completed",
                  idempotencyKey: projectChatBrainRunKey(id),
                });
              } catch (error) {
                logger.error("Failed to queue the project brain run", error);
              }
            });
          } catch (error) {
            logger.error("Failed to schedule the project brain run", error);
          }
        }

        if (agent) {
          // Recency bump only. Pass the active org so an org member using a
          // shared agent still updates it, and swallow failures (a non-owner of
          // a readonly/cross-org agent legitimately can't write) — this must
          // never break the chat response.
          agentRepository
            .updateAgent(
              agent.id,
              session.user.id,
              { updatedAt: new Date() } as any,
              activeOrganizationId,
            )
            .catch(() => {});
        }
      },
      onError: (error) => {
        runDeadline?.clear();
        clearStopPoll();
        // The terminal state is written in `onEnd`, which does not run when the
        // stream is torn down here. A persisted `runStatus: "running"` plus a
        // live Redis pointer is exactly what makes a reopened thread try to
        // resume a run that is already over, so retire both on this path too.
        if (metadata.runStatus === "running") {
          metadata.runStatus = "failed";
          metadata.error = { code: "stream_error", retryable: true };
        }
        // A torn-down UI stream does not reach the normal onEnd persistence
        // path. Persist the already durable user turn after the response so a
        // reopened conversation never remains falsely marked as running.
        failurePersistence ??= persistFailedChatRun({
          metadata,
          persist: (failedMetadata) => {
            const failedMessage = {
              threadId: thread!.id,
              role: message.role,
              parts: initialMessageParts.map(convertToSavePart),
              id: message.id,
              metadata: failedMetadata,
            };
            return message.role === "user"
              ? chatRepository.failMessageRun(failedMessage)
              : chatRepository.upsertMessage(failedMessage);
          },
          onPersistenceError: (persistenceError) =>
            logger.error(
              "Unable to persist chat stream failure",
              persistenceError,
            ),
        });
        try {
          after(async () => {
            await failurePersistence;
          });
        } catch {
          // The error callback can run outside Next's request context in tests
          // or custom runtimes. Keep a best-effort write in that case too.
          void failurePersistence;
        }
        if (resumeEnabled) {
          void Promise.allSettled([clearActiveStream(id), clearStop(id)]);
        }
        return handleError(error);
      },
      originalMessages: messages,
    });

    // Runs once the response has finished streaming, which is the last moment
    // before the instance is frozen and the pending log batch is lost with it.
    after(flushLogs);

    return createUIMessageStreamResponse({
      stream,
      // With Redis, tee the live SSE into a resumable stream keyed by streamId
      // and record threadId -> streamId so a reopened tab (GET .../stream) can
      // catch up mid-generation. The copy is independent of the client
      // response, so it keeps buffering even after the tab closes.
      consumeSseStream: resumeEnabled
        ? ({ stream: sseStream }) => {
            // A Redis failure must degrade to "this run is not resumable",
            // never an unhandled rejection that can kill the live response.
            setActiveStream(id, streamId).catch((error) =>
              logger.warn("Failed to record active stream pointer", error),
            );
            streamContext!
              .createNewResumableStream(streamId, () => sseStream)
              .catch((error) =>
                logger.warn("Failed to buffer resumable stream", error),
              );
          }
        : undefined,
    });
  } catch (error: unknown) {
    runDeadline?.clear();
    const errorName = error instanceof Error ? error.name : "UnknownError";
    timer.flush({ error: errorName });
    logger.error(error);
    const conflictResponse = getChatRunConflictResponse(error);
    if (conflictResponse) return conflictResponse;
    if (persistedMessage) {
      try {
        const failedMessage = {
          ...persistedMessage,
          parts: persistedMessage.parts.map(convertToSavePart),
          metadata: {
            ...persistedMessage.metadata,
            runStatus:
              errorName === "TimeoutError"
                ? ("timed_out" as const)
                : ("failed" as const),
            error: {
              code:
                errorName === "TimeoutError" ? "timeout" : "chat_start_failed",
              retryable: true,
            },
          },
        };
        if (
          failedMessage.role === "user" &&
          failedMessage.metadata.runAttemptId
        ) {
          await chatRepository.failMessageRun(failedMessage);
        } else {
          await chatRepository.upsertMessage(failedMessage);
        }
      } catch (persistenceError) {
        logger.error("Unable to persist chat start failure", persistenceError);
      }
    }
    return chatErrorResponse(
      "chat_unavailable",
      "The chat could not be started. Your message may already be saved; please reopen the conversation and try again.",
      500,
      true,
    );
  }
}
