import { streamObject } from "ai";

import { customModelProvider } from "lib/ai/models";
import { buildAgentGenerationPrompt } from "lib/ai/prompts";
import globalLogger from "logger";

import { AgentGenerateSchema } from "app-types/agent";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { workflowRepository } from "lib/db/repository";
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
  try {
    const session = await getSession();
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
      return Response.json({ error: bounded.error }, { status: bounded.status });
    }
    const parsed = AgentGenerationRequestSchema.safeParse(bounded.value);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid agent generation request" },
        { status: 400 },
      );
    }
    const { chatModel, message = "hello" } = parsed.data;

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

    const system = buildAgentGenerationPrompt(Array.from(toolNames));

    const result = streamObject({
      model:
        await customModelProvider.getModelWithFailureFallbackAsync(chatModel),
      system,
      prompt: message,
      schema: dynamicAgentTable,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    logger.error(error);
    return new Response(JSON.stringify({ error: "Failed to generate agent" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
