import { ChatMention } from "app-types/chat";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildSpeechSystemPrompt,
} from "lib/ai/prompts";
import { getAvailableDefaultVoiceTools } from "lib/ai/speech";
import globalLogger from "lib/logger";
import { getUserPreferences } from "lib/user/server";
import { getOwnedProjectThreadScope } from "lib/voice/project-status";
import { NextRequest } from "next/server";
import { safe } from "ts-safe";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "../../../chat/actions";
import {
  filterMcpServerCustomizations,
  getVoiceMcpToolDefinition,
  loadMcpTools,
  mergeSystemPrompt,
} from "../../../chat/shared.chat";

export const runtime = "nodejs";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Groq + KonvO Voice API: "),
});

interface SessionRequest {
  mentions?: ChatMention[];
  agentId?: string;
  threadId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    validateEnvironment();

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: SessionRequest | undefined;
    try {
      body = (await request.json()) as SessionRequest;
    } catch (_error) {
      body = undefined;
    }

    const { mentions = [], agentId, threadId } = body ?? {};

    const agent = await rememberAgentAction(agentId);
    if (agentId) {
      logger.info(`[${agentId}] Agent: ${agent?.name ?? "not found"}`);
    }

    const enabledMentions = agent ? agent.instructions.mentions : mentions;
    const allowedMcpTools = await loadMcpTools({
      mentions: enabledMentions,
      userId: session.user.id,
    });
    const toolNames = Object.keys(allowedMcpTools ?? {});

    if (toolNames.length > 0) {
      logger.info(`${toolNames.length} tools found`);
    } else {
      logger.info("No tools found");
    }

    const userPreferences = await getUserPreferences(session.user.id);

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction();
      })
      .map((value) => filterMcpServerCustomizations(allowedMcpTools!, value))
      .orElse({});

    const toolIdMap: Record<
      string,
      { serverId: string; serverName: string; toolName: string }
    > = {};

    // Convert tools to OpenAI-style function definitions for the Groq API
    const openAiStyleTools = Object.entries(allowedMcpTools ?? {}).map(
      ([name, tool]) => {
        // Map the sanitized name back to original server/tool names for execution
        toolIdMap[name] = {
          serverId: tool._mcpServerId,
          serverName: tool._mcpServerName,
          toolName: tool._originToolName,
        };

        const definition = getVoiceMcpToolDefinition(tool);
        return {
          type: "function" as const,
          function: {
            name,
            description: definition.description,
            parameters: definition.parameters,
          },
        };
      },
    );
    // The voice LLM runs on Flare AI when a Flare key is configured, else Groq.
    // Report a default model valid for the active provider so the client never
    // sends an unresolvable id (Flare needs a provider-prefixed id).
    const useFlare = Boolean(
      process.env.FLARE_API_KEY || process.env.KORE_API_KEY,
    );
    const groqModel = useFlare
      ? process.env.VOICE_CHAT_MODEL || "oc/deepseek-flash"
      : "llama-3.1-8b-instant";

    // Also convert the default voice tools
    const projectThreadScope = await getOwnedProjectThreadScope(
      session.user.id,
      threadId,
    );
    const availableDefaultTools = getAvailableDefaultVoiceTools({
      projectThreadAvailable: Boolean(projectThreadScope),
    });
    const defaultTools = availableDefaultTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const instructions = mergeSystemPrompt(
      buildSpeechSystemPrompt(
        session.user,
        userPreferences ?? undefined,
        agent ?? undefined,
        {
          provider: "groq",
          model: groqModel,
        },
      ),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations) +
        "\n\nLanguage policy: Only Hindi and English are allowed. Always reply in the exact same language as the user's most recent message. Never mix Hindi and English in the same response.",
    );

    return new Response(
      JSON.stringify({
        instructions,
        tools: [...openAiStyleTools, ...defaultTools],
        groqModel,
        toolIdMap,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    logger.error(error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { status: 500 },
    );
  }
}

function validateEnvironment() {
  // Voice chat LLM runs on Flare AI (preferred) or Groq. Require at least one.
  const hasLlmKey =
    process.env.FLARE_API_KEY ||
    process.env.KORE_API_KEY ||
    process.env.GROQ_API_KEY;
  if (!hasLlmKey) {
    throw new Error(
      "Missing environment variables: FLARE_API_KEY or GROQ_API_KEY",
    );
  }
}
