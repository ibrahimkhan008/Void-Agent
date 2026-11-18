import "server-only";
import { randomUUID } from "node:crypto";

import { createSandbox, errorLabel } from "@/lib/e2b/create-sandbox";
import { getExecutionTemplateId } from "@/lib/e2b/sandbox-registry";
import type { Sandbox } from "@e2b/code-interpreter";
import ts from "typescript";

export const HOOK_SCRIPT_MAX_SOURCE_CHARS = 16_000;
export const HOOK_SCRIPT_MAX_OUTPUT_CHARS = 12_000;
export const HOOK_SCRIPT_TIMEOUT_MS = 30_000;
export const HOOK_SCRIPT_MAX_PAYLOAD_CHARS = 24_000;
const HOOK_SCRIPT_SANDBOX_TTL_MS = 60_000;

export type HookScriptLanguage = "javascript" | "typescript" | "python";
export type HookScript = { language: HookScriptLanguage; source: string };

export type HookScriptResult = {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
};

function prepareScript(script: HookScript, payload: unknown): string {
  const serializedPayload = JSON.stringify(payload ?? {}).replace(
    /</g,
    "\\u003c",
  );
  if (script.language === "python") {
    return `import json\npayload = json.loads(${JSON.stringify(serializedPayload)})\n${script.source}`;
  }

  const wrapped = `const payload = JSON.parse(${JSON.stringify(serializedPayload)});\n${script.source}`;
  if (script.language === "javascript") return wrapped;

  const transpiled = ts.transpileModule(wrapped, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      isolatedModules: true,
      removeComments: true,
    },
  });
  const error = transpiled.diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(error.messageText, " ").slice(0, 500),
    );
  }
  return transpiled.outputText;
}

function readExecutionOutput(result: {
  logs?: { stdout?: string[]; stderr?: string[] };
  results?: Array<{ text?: string }>;
}): string {
  const pieces = [
    ...(result.logs?.stdout ?? []),
    ...(result.results ?? []).flatMap((item) => (item.text ? [item.text] : [])),
    ...(result.logs?.stderr ?? []).map((line) => `stderr: ${line}`),
  ];
  return pieces.join("\n").slice(0, HOOK_SCRIPT_MAX_OUTPUT_CHARS);
}

/**
 * Run an owner-authored hook step in an ephemeral, secured E2B microVM.
 * Network egress is denied at sandbox creation; secrets and app credentials
 * are never copied into the guest. Output is bounded before it reaches logs,
 * persistence, or the downstream agent prompt.
 */
export async function executeHookScript(input: {
  script: HookScript;
  payload: unknown;
  userId: string;
}): Promise<HookScriptResult> {
  const startedAt = Date.now();
  if (input.script.source.length > HOOK_SCRIPT_MAX_SOURCE_CHARS) {
    return {
      success: false,
      output: "",
      error: `Script exceeds the ${HOOK_SCRIPT_MAX_SOURCE_CHARS} character limit.`,
      executionTimeMs: 0,
    };
  }
  if (
    JSON.stringify(input.payload ?? {}).length > HOOK_SCRIPT_MAX_PAYLOAD_CHARS
  ) {
    return {
      success: false,
      output: "",
      error: `Event payload exceeds the ${HOOK_SCRIPT_MAX_PAYLOAD_CHARS} character limit.`,
      executionTimeMs: 0,
    };
  }
  if (!process.env.E2B_API_KEY) {
    return {
      success: false,
      output: "",
      error: "User-script hooks require E2B_API_KEY to be configured.",
      executionTimeMs: 0,
    };
  }

  let sandbox: Sandbox | undefined;
  try {
    const source = prepareScript(input.script, input.payload);
    sandbox = await createSandbox(getExecutionTemplateId(), {
      apiKey: process.env.E2B_API_KEY,
      secure: true,
      timeoutMs: HOOK_SCRIPT_SANDBOX_TTL_MS,
      billing: { userId: input.userId, customerId: null },
      requestId: `hook-script-${randomUUID()}`,
      allowInternetAccess: false,
      network: { allowOut: [], denyOut: ["0.0.0.0/0", "::/0"] },
    });

    const execution = await sandbox.runCode(source, {
      language: input.script.language === "python" ? "python" : "js",
      timeoutMs: HOOK_SCRIPT_TIMEOUT_MS,
    });
    const output = readExecutionOutput(execution);
    if (execution.error) {
      return {
        success: false,
        output,
        error: `${execution.error.name}: ${String(execution.error.value ?? "").slice(0, 1_000)}`,
        executionTimeMs: Date.now() - startedAt,
      };
    }
    return { success: true, output, executionTimeMs: Date.now() - startedAt };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: errorLabel(error).slice(0, 1_000),
      executionTimeMs: Date.now() - startedAt,
    };
  } finally {
    await sandbox?.kill().catch(() => undefined);
  }
}
