import "server-only";
import {
  LoadAPIKeyError,
  Tool,
  ToolUIPart,
  UIMessage,
  UIMessagePart,
  UIMessageStreamWriter,
  tool as createTool,
  getToolName,
  isToolUIPart,
  jsonSchema,
} from "ai";
import type { AgentFileBinding } from "app-types/agent";
import {
  ChatMention,
  ChatMetadata,
  ManualToolConfirmTag,
} from "app-types/chat";
import {
  AllowedMCPServer,
  McpServerCustomizationsPrompt,
  VercelAIMcpTool,
  VercelAIMcpToolTag,
} from "app-types/mcp";
import { MANUAL_REJECT_RESPONSE_PROMPT } from "lib/ai/prompts";
import { errorToString, exclude, objectFlow, toAny } from "lib/utils";
import logger from "logger";

import { ObjectJsonSchema7 } from "app-types/util";
import { workflowRepository } from "lib/db/repository";
import { safe } from "ts-safe";

import {
  VercelAIWorkflowTool,
  VercelAIWorkflowToolStreaming,
  VercelAIWorkflowToolStreamingResultTag,
  VercelAIWorkflowToolTag,
} from "app-types/workflow";
import { executeApprovedMcpTool } from "lib/ai/mcp/execute-approved-mcp-tool";
import { getMcpApprovalTargetFingerprint } from "lib/ai/mcp/mcp-approval-target";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { stripMcpApprovalField } from "lib/ai/speech/mcp-voice-approval";
import { AppDefaultToolkit } from "lib/ai/tools";
import {
  getMcpApprovalTokenKey,
  mcpToolApprovalSchema,
} from "lib/ai/tools/hitl/mcp-tool-approval";
import { getWorkflowApprovalTokenField } from "lib/ai/tools/hitl/workflow-run-approval";
import {
  APP_DEFAULT_TOOL_KIT,
  getAppDefaultToolKitForUser,
} from "lib/ai/tools/tool-kit";
import type { WorkflowExecutionInput } from "lib/ai/workflow/execution-state";
import { loadApprovedWorkflow } from "lib/ai/workflow/load-approved-workflow";
import { startSavedWorkflowExecution } from "lib/ai/workflow/run-saved-workflow";
import { mcpToolApprovalRepository } from "lib/db/pg/repositories/mcp-tool-approval-repository.pg";
import { getEnabledCategories } from "lib/site-config-runtime";

export function filterMCPToolsByMentions(
  tools: Record<string, VercelAIMcpTool>,
  mentions: ChatMention[],
) {
  if (mentions.length === 0) {
    return tools;
  }
  const toolMentions = mentions.filter(
    (mention) => mention.type == "mcpTool" || mention.type == "mcpServer",
  ) as Extract<ChatMention, { type: "mcpTool" | "mcpServer" }>[];

  const metionsByServer = toolMentions.reduce(
    (acc, mention) => {
      if (mention.type == "mcpServer") {
        return {
          ...acc,
          [mention.serverId]: Object.values(tools).map(
            (tool) => tool._originToolName,
          ),
        };
      }
      return {
        ...acc,
        [mention.serverId]: [...(acc[mention.serverId] ?? []), mention.name],
      };
    },
    {} as Record<string, string[]>,
  );

  return objectFlow(tools).filter((_tool) => {
    if (!metionsByServer[_tool._mcpServerId]) return false;
    return metionsByServer[_tool._mcpServerId].includes(_tool._originToolName);
  });
}

export function filterMCPToolsByAllowedMCPServers(
  tools: Record<string, VercelAIMcpTool>,
  allowedMcpServers?: Record<string, AllowedMCPServer>,
): Record<string, VercelAIMcpTool> {
  if (!allowedMcpServers || Object.keys(allowedMcpServers).length === 0) {
    return {};
  }
  return objectFlow(tools).filter((_tool) => {
    if (!allowedMcpServers[_tool._mcpServerId]?.tools) return false;
    return allowedMcpServers[_tool._mcpServerId].tools.includes(
      _tool._originToolName,
    );
  });
}

export function excludeToolExecution(
  tool: Record<string, Tool>,
): Record<string, Tool> {
  return objectFlow(tool).map((value) => {
    return createTool({
      inputSchema: value.inputSchema,
      description: value.description,
    });
  });
}

export function mergeSystemPrompt(
  ...prompts: (string | undefined | false)[]
): string {
  const filteredPrompts = prompts
    .map((prompt) => (prompt ? prompt.trim() : ""))
    .filter(Boolean);
  return filteredPrompts.join("\n\n");
}

export function manualToolExecuteByLastMessage(
  part: ToolUIPart,
  tools: Record<string, VercelAIMcpTool | VercelAIWorkflowTool | Tool>,
  userId: string,
  abortSignal?: AbortSignal,
  userRole?: string | null,
) {
  const { input } = part;

  const toolName = getToolName(part);

  const tool = tools[toolName];
  return safe(() => {
    if (!tool) throw new Error(`tool not found: ${toolName}`);
    if (!ManualToolConfirmTag.isMaybe(part.output))
      throw new Error("manual tool confirm not found");
    return part.output;
  })
    .map(({ confirm }) => {
      if (!confirm) return MANUAL_REJECT_RESPONSE_PROMPT;
      if (VercelAIWorkflowToolTag.isMaybe(tool)) {
        return tool.execute!(input, {
          toolCallId: part.toolCallId,
          abortSignal: abortSignal ?? new AbortController().signal,
          messages: [],
        });
      } else if (VercelAIMcpToolTag.isMaybe(tool)) {
        const approvalTokenKey =
          tool._approvalTokenKey ?? "voidAgentApprovalToken";
        const proposalConfigFingerprint = tool._approvalConfigFingerprint;
        const { [approvalTokenKey]: _approvalToken, ...toolPayload } =
          input as Record<string, unknown>;
        const approval = mcpToolApprovalSchema.parse({
          serverId: tool._mcpServerId,
          serverName: tool._mcpServerName,
          toolName: tool._originToolName,
          payload: toolPayload,
        });
        return getMcpApprovalTargetFingerprint({ userId, userRole, approval })
          .then((fingerprint) => {
            if (
              !proposalConfigFingerprint ||
              fingerprint !== proposalConfigFingerprint
            )
              throw new Error(
                "MCP server configuration changed; review a fresh tool proposal.",
              );
            return mcpToolApprovalRepository.issue(
              userId,
              approval,
              proposalConfigFingerprint,
            );
          })
          .then((approvalToken) =>
            tool.execute!(
              { ...toolPayload, [approvalTokenKey]: approvalToken },
              {
                toolCallId: part.toolCallId,
                abortSignal: abortSignal ?? new AbortController().signal,
                messages: [],
              },
            ),
          );
      }
      return tool.execute!(input, {
        toolCallId: part.toolCallId,
        abortSignal: abortSignal ?? new AbortController().signal,
        messages: [],
      });
    })
    .ifFail((error) => ({
      isError: true,
      statusMessage: `tool call fail: ${toolName}`,
      error: errorToString(error),
    }))
    .unwrap();
}

import { isRateLimitError, rotateOpenRouterKey } from "lib/ai/models";

export function handleError(error: any) {
  // On rate limit or provider errors, rotate keys for subsequent requests
  if (isRateLimitError(error) || isProviderAuthError(error)) {
    const rotatedOR = rotateOpenRouterKey();
    if (rotatedOR) {
      logger.info("Error detected - rotated to next OpenRouter API key");
    }
  }

  // Log full detail server-side only.
  logger.error(error);
  logger.error(`Route Error: ${error.name}`);

  // Info-hygiene: never reflect provider/key diagnostics to clients. The
  // previous behavior returned LoadAPIKeyError text (which names missing env
  // keys) and raw upstream response bodies — useful recon for attackers.
  if (isRateLimitError(error)) {
    return "The selected model is rate limited right now. Please retry shortly or pick another model.";
  }
  if (
    LoadAPIKeyError.isInstance(error) ||
    isProviderAuthError(error) ||
    extractProviderError(error)
  ) {
    return "The model provider returned an error. Please try another model.";
  }

  return "An error occurred while processing your request.";
}

/**
 * Check if error is a provider authentication/authorization error that should trigger key rotation.
 */
function isProviderAuthError(error: any): boolean {
  if (!error) return false;
  const message = error?.message?.toLowerCase() || "";
  return (
    message.includes("provider error") ||
    message.includes("provider_error") ||
    message.includes("provider_stream_processing_error") ||
    message.includes("403") ||
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("authentication")
  );
}

/**
 * Extract actual error message from nested error causes.
 * AI SDK wraps provider errors in generic messages like
 * "An error occurred while streaming the response from the model provider."
 * This function digs into the cause chain to find the real error.
 */
function extractProviderError(error: any): string | null {
  // Check for Provider Error from our normalizeToolCallsFetch
  if (error?.message?.includes("Provider Error:")) {
    return error.message;
  }

  // Check the cause chain (AI SDK nests errors)
  let cause = error?.cause;
  let depth = 0;
  while (cause && depth < 5) {
    if (cause?.message?.includes("Provider Error:")) {
      return cause.message;
    }
    if (
      cause?.message &&
      !cause.message.includes("An error occurred while streaming")
    ) {
      return `Model provider error: ${cause.message}`;
    }
    cause = cause?.cause;
    depth++;
  }

  // Check for responseBody with error details
  if (error?.responseBody) {
    try {
      const body =
        typeof error.responseBody === "string"
          ? JSON.parse(error.responseBody)
          : error.responseBody;
      if (body?.error?.message) {
        return `Model provider error: ${body.error.message}`;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function extractInProgressToolPart(message: UIMessage): ToolUIPart[] {
  if (message.role != "assistant") return [];
  if ((message.metadata as ChatMetadata)?.toolChoice != "manual") return [];
  return message.parts.filter(
    (part) =>
      isToolUIPart(part) &&
      part.state == "output-available" &&
      ManualToolConfirmTag.isMaybe(part.output),
  ) as ToolUIPart[];
}

export function filterMcpServerCustomizations(
  tools: Record<string, VercelAIMcpTool>,
  mcpServerCustomization: Record<string, McpServerCustomizationsPrompt>,
): Record<string, McpServerCustomizationsPrompt> {
  const toolNamesByServerId = Object.values(tools).reduce(
    (acc, tool) => {
      if (!acc[tool._mcpServerId]) acc[tool._mcpServerId] = [];
      acc[tool._mcpServerId].push(tool._originToolName);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  return Object.entries(mcpServerCustomization).reduce(
    (acc, [serverId, mcpServerCustomization]) => {
      if (!(serverId in toolNamesByServerId)) return acc;

      if (
        !mcpServerCustomization.prompt &&
        !Object.keys(mcpServerCustomization.tools ?? {}).length
      )
        return acc;

      const prompts: McpServerCustomizationsPrompt = {
        id: serverId,
        name: mcpServerCustomization.name,
        prompt: mcpServerCustomization.prompt,
        tools: mcpServerCustomization.tools
          ? objectFlow(mcpServerCustomization.tools).filter((_, key) => {
              return toolNamesByServerId[serverId].includes(key as string);
            })
          : {},
      };

      acc[serverId] = prompts;

      return acc;
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  );
}

export const workflowToVercelAITool = ({
  id,
  description,
  schema,
  dataStream,
  name,
  userId,
}: {
  id: string;
  name: string;
  description?: string;
  schema: ObjectJsonSchema7;
  dataStream: UIMessageStreamWriter;
  userId: string;
}): VercelAIWorkflowTool => {
  const rawToolName = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
  const toolName = rawToolName.length ? rawToolName : `WORKFLOW_${id}`;

  const approvalTokenField = getWorkflowApprovalTokenField(
    schema.properties ?? {},
  );
  const toolSchema = jsonSchema({
    ...schema,
    properties: {
      ...(schema.properties ?? {}),
      [approvalTokenField]: {
        type: "string",
        minLength: 40,
        maxLength: 128,
        description: "One-use approval token from proposeWorkflowRun",
      },
    },
    required: [...(schema.required ?? []), approvalTokenField],
  });
  const tool = createTool({
    description: `${name} (workflowId ${id}). Before running, use proposeWorkflowRun with platform saved-workflow, target ${id}, workflowName ${name}, the exact input payload, and approvalTokenField ${approvalTokenField}. Then pass the returned token under ${approvalTokenField}; execution checks current publication/access. ${description?.trim().slice(0, 50) ?? ""}`,
    inputSchema: toolSchema,
    async execute(query, { toolCallId, abortSignal }) {
      const { [approvalTokenField]: approvalToken, ...workflowInput } =
        query as Record<string, unknown>;
      const history: VercelAIWorkflowToolStreaming[] = [];
      const toolResult = VercelAIWorkflowToolStreamingResultTag.create({
        toolCallId,
        workflowName: name,

        startedAt: Date.now(),
        endedAt: Date.now(),
        history,
        result: undefined,
        status: "running",
      });
      const emitUpdate = () =>
        dataStream.write({
          type: "tool-output-available",
          toolCallId,
          output: toolResult,
          // Server-executed tool: prevent automatic resend from replaying effects.
          providerExecuted: true,
        });
      try {
        const workflow = await loadApprovedWorkflow({
          userId,
          workflowId: id,
          workflowName: name,
          approvalTokenField,
          approvalToken,
          payload: workflowInput,
        });
        toolResult.workflowIcon = workflow.icon;
        const outcome = await startSavedWorkflowExecution({
          userId,
          workflow,
          workflowName: name,
          executionInput: workflowInput as WorkflowExecutionInput,
          workflowIcon: workflow.icon,
          abortSignal,
          onProgress: (nextHistory) => {
            toolResult.history = nextHistory;
            emitUpdate();
          },
        });
        toolResult.endedAt = Date.now();
        toolResult.status = outcome.status;
        toolResult.executionId = outcome.executionId;
        toolResult.pendingEffect =
          "pendingEffect" in outcome ? outcome.pendingEffect : undefined;
        toolResult.error = "error" in outcome ? outcome.error : undefined;
        toolResult.history = outcome.history;
        toolResult.result = "result" in outcome ? outcome.result : undefined;
        emitUpdate();
        return toolResult;
      } catch (error) {
        return {
          error: {
            name: error instanceof Error ? error.name : "ERROR",
            message: errorToString(error),
            history,
          },
        };
      }
    },
  }) as VercelAIWorkflowTool;

  tool._workflowId = id;
  tool._originToolName = name;
  tool._toolName = toolName;

  return VercelAIWorkflowToolTag.create(tool);
};

export const workflowToVercelAITools = (
  workflows: {
    id: string;
    name: string;
    description?: string;
    schema: ObjectJsonSchema7;
  }[],
  dataStream: UIMessageStreamWriter,
  userId: string,
) => {
  return workflows
    .map((v) =>
      workflowToVercelAITool({
        ...v,
        dataStream,
        userId,
      }),
    )
    .reduce(
      (prev, cur) => {
        prev[cur._toolName] = cur;
        return prev;
      },
      {} as Record<string, VercelAIWorkflowTool>,
    );
};

export const loadMcpTools = (opt?: {
  mentions?: ChatMention[];
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  userId?: string;
  userRole?: string | null;
}) =>
  safe(async () => {
    if (!opt?.userId) return {} as Record<string, VercelAIMcpTool>;
    const userId = opt.userId;
    const requestedServerIds = new Set(
      opt.mentions?.length
        ? opt.mentions
            .filter(
              (mention) =>
                mention.type === "mcpTool" || mention.type === "mcpServer",
            )
            .map((mention) => mention.serverId)
        : Object.keys(opt.allowedMcpServers ?? {}),
    );
    if (requestedServerIds.size === 0)
      return {} as Record<string, VercelAIMcpTool>;

    // Only synchronize MCP servers this chat is allowed to expose. A failed
    // refresh is recorded as missing and that server's stale tool schema is
    // omitted below.
    const fingerprintsByServer = new Map<string, string>();
    await Promise.all(
      Array.from(requestedServerIds).map(async (serverId) => {
        try {
          const fingerprint =
            await mcpClientsManager.refreshClientIfConfigChanged(serverId);
          if (fingerprint) fingerprintsByServer.set(serverId, fingerprint);
        } catch {
          // Fail closed for this server while allowing other MCPs to load.
        }
      }),
    );
    if (fingerprintsByServer.size === 0)
      return {} as Record<string, VercelAIMcpTool>;

    const allTools = await mcpClientsManager.tools();
    const tools = opt.mentions?.length
      ? filterMCPToolsByMentions(allTools, opt.mentions)
      : filterMCPToolsByAllowedMCPServers(allTools, opt.allowedMcpServers);

    const entries = await Promise.all(
      Object.entries(tools).map(async ([id, mcpTool]) => {
        const approvalConfigFingerprint = fingerprintsByServer.get(
          mcpTool._mcpServerId,
        );
        if (
          !approvalConfigFingerprint ||
          mcpTool._approvalConfigFingerprint !== approvalConfigFingerprint
        ) {
          return null;
        }
        try {
          const currentFingerprint = await getMcpApprovalTargetFingerprint({
            userId,
            userRole: opt.userRole,
            approval: {
              serverId: mcpTool._mcpServerId,
              serverName: mcpTool._mcpServerName,
            },
          });
          if (currentFingerprint !== approvalConfigFingerprint) return null;
        } catch {
          return null;
        }

        const schema = toAny(mcpTool.inputSchema) as ObjectJsonSchema7;
        const required = Array.isArray(schema.required) ? schema.required : [];
        const properties = schema.properties ?? {};
        const approvalTokenKey = getMcpApprovalTokenKey(properties);
        const inputSchema = jsonSchema({
          ...schema,
          properties: {
            ...properties,
            [approvalTokenKey]: {
              type: "string",
              minLength: 40,
              maxLength: 128,
              description: "One-use token from the MCP review card",
            },
          },
          required: [
            ...required.filter((key) => key !== approvalTokenKey),
            approvalTokenKey,
          ],
        });
        return [
          id,
          VercelAIMcpToolTag.create({
            ...mcpTool,
            _approvalTokenKey: approvalTokenKey,
            _originalDescription: mcpTool.description,
            inputSchema,
            description: `${mcpTool.description ?? ""}\nRequires explicit approval of the exact arguments via proposeMcpToolCall before execution; pass the token in ${approvalTokenKey}. Copy this serverConfigFingerprint exactly into the approval proposal: ${approvalConfigFingerprint}`,
            execute: async (input, _options) => {
              const { [approvalTokenKey]: approvalToken, ...toolPayload } =
                input as Record<string, unknown>;
              return executeApprovedMcpTool({
                userId,
                token: approvalToken,
                approvalPayload: {
                  serverId: mcpTool._mcpServerId,
                  serverName: mcpTool._mcpServerName,
                  toolName: mcpTool._originToolName,
                  payload: toolPayload,
                },
                getCurrentConfigFingerprint: () =>
                  getMcpApprovalTargetFingerprint({
                    userId,
                    userRole: opt.userRole,
                    approval: {
                      serverId: mcpTool._mcpServerId,
                      serverName: mcpTool._mcpServerName,
                    },
                  }),
                execute: (expectedConfigFingerprint) =>
                  mcpClientsManager.toolCall(
                    mcpTool._mcpServerId,
                    mcpTool._originToolName,
                    toolPayload,
                    expectedConfigFingerprint,
                    mcpTool._mcpServerName,
                  ),
              });
            },
          }),
        ] as const;
      }),
    );
    return Object.fromEntries(
      entries.flatMap((entry) => (entry ? [entry] : [])),
    );
  }).orElse({} as Record<string, VercelAIMcpTool>);

export function getVoiceMcpToolDefinition(tool: VercelAIMcpTool) {
  const schema = toAny(tool.inputSchema) as ObjectJsonSchema7;
  const voiceSchema = stripMcpApprovalField(schema, tool._approvalTokenKey);
  const { jsonSchema: openAiSchema } = jsonSchema(voiceSchema);
  return {
    description: tool._originalDescription ?? tool.description,
    parameters: openAiSchema,
  };
}

export const loadWorkFlowTools = (opt: {
  mentions?: ChatMention[];
  dataStream: UIMessageStreamWriter;
  userId: string;
}) =>
  safe(() =>
    opt?.mentions?.length
      ? workflowRepository.selectToolByIds(
          opt?.mentions
            ?.filter((m) => m.type == "workflow")
            .map(
              (v) =>
                (v as Extract<ChatMention, { type: "workflow" }>).workflowId,
            ),
        )
      : [],
  )
    .map((tools) => workflowToVercelAITools(tools, opt.dataStream, opt.userId))
    .orElse({} as Record<string, VercelAIWorkflowTool>);

export const loadAppDefaultTools = async (opt?: {
  mentions?: ChatMention[];
  allowedAppDefaultToolkit?: string[];
  userId?: string;
  threadId?: string;
  agentFiles?: AgentFileBinding[];
}) => {
  // Use user-specific tools if userId is provided
  const toolKit = opt?.userId
    ? getAppDefaultToolKitForUser(opt.userId, opt.threadId, opt.agentFiles)
    : APP_DEFAULT_TOOL_KIT;

  // Get enabled categories from site config
  let enabledCategories: Set<string> | null = null;
  try {
    enabledCategories = await getEnabledCategories();
  } catch {
    /* fall through to all categories */
  }

  return safe(toolKit)
    .map((tools) => {
      if (opt?.mentions?.length) {
        const defaultToolMentions = opt.mentions.filter(
          (m) => m.type == "defaultTool",
        );
        return Array.from(Object.values(tools)).reduce((acc, t) => {
          const allowed = objectFlow(t).filter((_, k) => {
            return defaultToolMentions.some((m) => m.name == k);
          });
          return { ...acc, ...allowed };
        }, {});
      }
      const allowedAppDefaultToolkit =
        opt?.allowedAppDefaultToolkit ?? Object.values(AppDefaultToolkit);

      return (
        allowedAppDefaultToolkit.reduce(
          (acc, key) => {
            // Skip categories disabled by site config
            if (
              enabledCategories &&
              !enabledCategories.has(key.toLowerCase())
            ) {
              return acc;
            }
            return { ...acc, ...tools[key] };
          },
          {} as Record<string, Tool>,
        ) || {}
      );
    })
    .ifFail((e) => {
      console.error(e);
      throw e;
    })
    .orElse({} as Record<string, Tool>);
};

export const convertToSavePart = <T extends UIMessagePart<any, any>>(
  part: T,
) => {
  return safe(
    exclude(part as any, ["providerMetadata", "callProviderMetadata"]) as T,
  )
    .map((v) => {
      if (isToolUIPart(v) && v.state.startsWith("output")) {
        if (VercelAIWorkflowToolStreamingResultTag.isMaybe(v.output)) {
          return {
            ...v,
            output: {
              ...v.output,
              history: v.output.history.map((h: any) => {
                return {
                  ...h,
                  result: undefined,
                };
              }),
            },
          };
        }
      }
      return v;
    })
    .unwrap();
};
