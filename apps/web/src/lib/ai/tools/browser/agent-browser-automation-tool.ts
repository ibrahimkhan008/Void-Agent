import "server-only";
import {
  type LanguageModel,
  type UIMessage,
  tool as createTool,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import {
  AGENT_BROWSER_DEFAULT_TIMEOUT_MS,
  closeAgentBrowserSession,
  runAgentBrowserCommand,
} from "lib/agent-browser/client";
import { aiTelemetry } from "lib/ai/telemetry";
import {
  BROWSER_MAX_STEPS,
  type BrowserToolOutput,
  UNATTENDED_MAX_RUN_MS,
} from "lib/kernel/browser-contract";
import {
  BROWSER_EGRESS_ISOLATION_REQUIRED_MESSAGE,
  isBrowserEgressIsolationEnabled,
} from "lib/kernel/browser-egress-capability";
import { createSecretRedactor } from "lib/kernel/redact-secrets";
import logger from "logger";
import { z } from "zod";
import {
  BLOCKED_TOOL_ACK,
  BLOCKED_TOOL_NAME,
  readBlockedReason,
} from "./blocked-signal";
import { browserAutomationSchema } from "./browser-automation-tool";

/**
 * The free browser provider: the same browser-automation contract as the
 * Kernel tool (`browserAutomationSchema`, `BrowserToolOutput`, the blocked
 * signal, the same gates), executed against the open-source `agent-browser`
 * CLI instead of a Kernel cloud session.
 *
 * Where the Kernel inner agent writes Playwright code that Kernel executes
 * remotely, this inner agent issues ONE CLI COMMAND per step — snapshot, read,
 * click a `@ref`, fill, wait — against a persistent per-run session daemon.
 * No arbitrary code is evaluated in Node: the worst case inside a command is
 * `eval`, which runs in the PAGE context over CDP, the same trust level the
 * Kernel provider's code contract already grants.
 *
 * No credential vault on this provider (the vault belongs to Kernel's
 * profile system): `credentialAlias` is accepted for schema parity and
 * ignored, and the instructions tell the agent there are no stored sign-ins —
 * a wall is reported, not forced.
 */

const AGENT_BROWSER_RULES = `Rules:
- You drive a real Chrome browser through the agent-browser CLI, ONE command
  per tool call. The loop is: \`snapshot -i\` to read the page as a compact
  accessibility tree with per-element refs (\`@e1\`…), act on a ref with
  \`click @e1\` / \`fill @e2 "text"\`, then re-\`snapshot\` to confirm.
- Refs die when the page navigates or its DOM changes. Re-snapshot before
  acting on anything you have not read this turn. Do not guess at refs.
- There are NO stored credentials on this provider. If you land on a sign-in
  form, a one-time code, an identity check, an app approval or a hardware
  key: do NOT improvise and do NOT look for another way in. Call
  \`${BLOCKED_TOOL_NAME}\` with a short, concrete description of what the page is
  asking for, then write your summary and stop.
- Never invent, guess or brute-force a credential, and never type a password
  out of the task text.
- This browser has no automatic CAPTCHA solver. If a challenge appears, wait
  (\`wait\` + \`snapshot\`) a reasonable amount of time; if it does not clear,
  call \`${BLOCKED_TOOL_NAME}\` rather than clicking anything that says "verify you
  are human".
- Keep every command inside the allowed list; the runner rejects anything
  else.

Finish with a clear, self-contained summary of what you did and what you
found: concrete values, names and URLs. That summary is the ONLY thing
returned to the main agent, so it must stand alone. If you could not complete
the task, say so plainly and say why.`;

const AGENT_BROWSER_INTERACTIVE_INSTRUCTIONS = `You are a browser automation agent
driving a real Chrome browser through the agent-browser CLI. The user sees
your commands and their output as you work, so navigate deliberately, one
clear step at a time.

${AGENT_BROWSER_RULES}`;

const AGENT_BROWSER_UNATTENDED_INSTRUCTIONS = `You are a browser automation agent
driving a real Chrome browser through the agent-browser CLI, on a scheduled
run. NOBODY IS WATCHING. Work efficiently: you have a hard time limit and a
small step budget.

${AGENT_BROWSER_RULES}

Because nobody is present: when you call \`${BLOCKED_TOOL_NAME}\`, the browser is torn
down and the whole scheduled run is recorded as a failure with your reason
attached. Before you do, include what you can see: the current URL and the
page title, so the failure names where it stopped.`;

/** Bounded, per-argument length so one command cannot smuggle megabytes. */
const MAX_ARGS = 24;
const MAX_ARG_LENGTH = 800;

export const createAgentBrowserAutomationTool = ({
  model,
  customerId,
  entityId,
  organizationId,
  threadId,
  modelId,
  unattended = false,
  onRunBlocked,
}: {
  model: LanguageModel;
  customerId?: string;
  entityId?: string;
  organizationId?: string;
  threadId?: string;
  modelId?: string;
  /** No human present: hard time cap, blocked instead of parked. */
  unattended?: boolean;
  onRunBlocked?: (block: { source: string; reason: string }) => void;
}) => {
  if (!isBrowserEgressIsolationEnabled()) {
    throw new Error(BROWSER_EGRESS_ISOLATION_REQUIRED_MESSAGE);
  }

  const instructions = unattended
    ? AGENT_BROWSER_UNATTENDED_INSTRUCTIONS
    : AGENT_BROWSER_INTERACTIVE_INSTRUCTIONS;

  // Nothing secret ever enters this run (no vault), but the terminal strings
  // still pass through the redactor for defense in depth.
  const redact = createSecretRedactor([]);

  return createTool<
    { task: string; credentialAlias?: string },
    BrowserToolOutput,
    Record<string, unknown>
  >({
    description: `Drive a real web browser to complete a task on a website.

Use this when the user asks you to:
- Look something up on a specific site that search cannot reach (a dashboard, a portal, an app behind a login)
- Fill in a form, click through a flow, or check the state of a page
- Read a page that blocks simple fetching

Do NOT use this for ordinary web research — use webSearch, which is far cheaper and faster.
Do NOT use this to fetch a plain public URL — use the http tool.

This run has no stored sign-ins: a login wall, one-time code or identity
check is reported as 'blocked', never forced.

If a result comes back with status 'blocked', the page needed a person.
Calling again will hit the same wall, so report what it says instead of
retrying.`,
    inputSchema: browserAutomationSchema,
    execute: async function* ({ task }, { abortSignal, toolCallId }) {
      // One session per tool invocation; the daemon self-exits after an hour
      // idle even if this close fails.
      const sessionId = `ab-${toolCallId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)}`;

      // The first command boots the daemon + browser; surface that as
      // "starting" immediately so the panel opens while the CLI warms up.
      yield { status: "starting" as const, sessionId };

      let stepCount = 0;
      let summary = "";
      let blockedReason: string | null = null;

      const runTimeout = unattended
        ? AbortSignal.timeout(UNATTENDED_MAX_RUN_MS)
        : null;
      const runSignal =
        runTimeout && abortSignal
          ? AbortSignal.any([abortSignal, runTimeout])
          : (runTimeout ?? abortSignal);

      try {
        const result = streamText({
          model,
          system: instructions,
          prompt: task,
          tools: {
            browser_command: createTool({
              description:
                "Run ONE agent-browser CLI command against the open browser session. args[0] is the command (open, snapshot, read, click, fill, type, press, hover, select, check, scroll, wait, screenshot, get, find, cookies, console, errors, tab, eval, close…); the rest are its arguments. Do NOT pass --session; it is applied for you.",
              inputSchema: z.object({
                args: z
                  .array(z.string().max(MAX_ARG_LENGTH))
                  .min(1)
                  .max(MAX_ARGS),
              }),
              execute: async ({ args }, options) => {
                stepCount += 1;
                const result = await runAgentBrowserCommand(args, {
                  session: sessionId,
                  timeoutMs: unattended
                    ? 60_000
                    : AGENT_BROWSER_DEFAULT_TIMEOUT_MS,
                  signal: options?.abortSignal,
                });
                const banner = result.timedOut
                  ? `[command timed out after its limit]\n`
                  : "";
                return `${banner}${result.output || (result.ok ? "(no output)" : "(command failed)")}`;
              },
            }),
            [BLOCKED_TOOL_NAME]: createTool({
              description:
                "Stop because the page needs a person: an identity check, a one-time code, a CAPTCHA, a device approval, or a sign-in with no stored credential. The run ends and the reason is reported to whoever owns it.",
              inputSchema: z.object({
                reason: z
                  .string()
                  .min(1)
                  .describe(
                    "What the page is asking for, in one plain sentence, plus the URL you are on. Never include a credential value.",
                  ),
              }),
              execute: async () => BLOCKED_TOOL_ACK,
            }),
          },
          stopWhen: stepCountIs(
            BROWSER_MAX_STEPS[unattended ? "unattended" : "interactive"],
          ),
          abortSignal: runSignal,
          maxRetries: 0,
          experimental_telemetry: aiTelemetry("chat.agent-browser-automation", {
            organizationId,
            threadId,
            modelId,
          }),
        });

        let lastMessage: UIMessage | undefined;
        for await (const message of readUIMessageStream({
          stream: toUIMessageStream({ stream: result.fullStream }),
        })) {
          lastMessage = message;
          yield { status: "running" as const, sessionId, message };
        }

        for (const part of lastMessage?.parts ?? []) {
          if (part.type === "text" && part.text.trim()) {
            summary = part.text.trim();
          }
        }
        stepCount =
          lastMessage?.parts.filter((p) => p.type.startsWith("tool-")).length ??
          stepCount;

        blockedReason = readBlockedReason(lastMessage?.parts ?? []);

        if (blockedReason) {
          const reason = redact(blockedReason);
          onRunBlocked?.({ source: "agent-browser-automation", reason });
          yield {
            status: "blocked" as const,
            sessionId,
            reason,
            summary: redact(summary),
            stepCount,
          };
        } else {
          yield {
            status: "done" as const,
            sessionId,
            summary:
              redact(summary) || "The browser agent returned no summary.",
            stepCount,
          };
        }

        await trackInnerTokens({
          result,
          customerId,
          entityId,
          modelId,
          sessionId,
          runId: toolCallId,
        });
      } catch (error) {
        const timedOut = runTimeout?.aborted === true;
        const message = timedOut
          ? `The browser run hit its ${Math.round(
              UNATTENDED_MAX_RUN_MS / 1000,
            )}s limit and was stopped.`
          : error instanceof Error
            ? error.message
            : "Browser task failed";
        logger.error(`[agent-browser] run ${sessionId} failed`, message);
        if (unattended) {
          onRunBlocked?.({
            source: "agent-browser-automation",
            reason: message,
          });
        }
        yield { status: "failed" as const, sessionId, error: redact(message) };
      } finally {
        // Free the machine: the daemon holds a Chrome process per session.
        await closeAgentBrowserSession(sessionId);
      }
    },
    toModelOutput: ({ output }) => ({
      type: "text",
      value:
        output.status === "done"
          ? output.summary
          : output.status === "failed"
            ? `The browser task failed: ${output.error}`
            : output.status === "blocked"
              ? describeBlocked(output)
              : "Browser task in progress.",
    }),
  });
};

function describeBlocked(
  output: Extract<BrowserToolOutput, { status: "blocked" }>,
): string {
  return [
    `The browser stopped because the page needs a person: ${output.reason}`,
    output.summary
      ? `Progress before it stopped: ${output.summary}`
      : "Nothing was completed before it stopped.",
    "The browser has been closed. Do NOT call this tool again for the same site — the same check will block it. Report this outcome and what it would take to get past it.",
  ].join("\n\n");
}

type UsageBearingResult = {
  totalUsage: PromiseLike<{
    inputTokens?: number;
    outputTokens?: number;
  }>;
};

/** Bill the tokens the inner browser agent burned (same rule as Kernel). */
async function trackInnerTokens(input: {
  result: UsageBearingResult;
  customerId?: string;
  entityId?: string;
  modelId?: string;
  sessionId: string;
  runId: string;
}): Promise<void> {
  const { result, customerId, entityId, modelId, sessionId, runId } = input;
  if (!customerId || !modelId) return;

  try {
    const usage = await result.totalUsage;
    const promptTokens = usage?.inputTokens ?? 0;
    const completionTokens = usage?.outputTokens ?? 0;
    if (promptTokens + completionTokens <= 0) return;

    const { trackUsage } = await import("lib/gate/metering");
    const { billingRunKey } = await import("lib/billing/usage-idempotency");
    await trackUsage({
      kind: "tokens",
      customerId,
      entityId,
      modelId,
      promptTokens,
      completionTokens,
      idempotencyKey: billingRunKey({
        scope: "agent-browser-agent",
        subject: customerId,
        detail: sessionId,
        runId,
      }),
    });
  } catch (error) {
    logger.error(
      `[agent-browser] failed to bill agent tokens for ${sessionId}`,
      error instanceof Error ? error.message : error,
    );
  }
}
