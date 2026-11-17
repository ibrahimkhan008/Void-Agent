import "server-only";
import {
  type LanguageModel,
  Output,
  type UIMessage,
  tool as createTool,
  generateText,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import type { Tool } from "ai";
import { aiTelemetry } from "lib/ai/telemetry";
import { e2bSandboxTool } from "lib/ai/tools/code/e2b-sandbox-tool";
import { jsExecutionTool } from "lib/ai/tools/code/js-run-tool";
import { pythonExecutionTool } from "lib/ai/tools/code/python-run-tool";
import { httpFetchTool } from "lib/ai/tools/http/fetch";
import { searchKnowledgeBase } from "lib/ai/tools/knowledge-base/search-knowledge-base";
import {
  createExaContentsTool,
  createExaSearchTool,
} from "lib/ai/tools/web/web-search";
import {
  type StoredOrchestratorResult,
  type StoredOrchestratorWorker,
  createOrchestratorCheckpoint,
  getOrchestratorCheckpoint,
  saveOrchestratorCheckpoint,
} from "lib/db/pg/repositories/orchestrator-checkpoint-repository.pg";
import { generateUUID } from "lib/utils";
import globalLogger from "logger";
import { z } from "zod";

/**
 * Void Orchestrator (master prompt §3.2/§3.4 — Stage 06): the main agent
 * decomposes an objective into role-scoped worker tasks and runs them as
 * CONCURRENT inner agents — 06A Research & Inspect (read-only), 06B Build &
 * Modify (sandboxed write scope), 06C Test & Analyze (verification) — then
 * integrates their outputs behind a verification gate.
 *
 * Pattern: the orchestrator-worker fan-out (Anthropic's canonical multi-agent
 * design), implemented with the subagent-as-tool pattern the research
 * subagent established — each worker is an inner streamText agent whose
 * UIMessage streams are interleaved into this tool's output frames, so the
 * UI shows every worker lane live while they run in parallel.
 *
 * Guarantees per the master prompt:
 * - Workers are role-scoped: each lane gets ONLY the tools its role needs.
 * - A failed worker retries ONCE with its failure reason attached.
 * - When verification criteria are provided, a verification worker (06C)
 *   re-checks the build outputs against them — repaired ≠ verified.
 * - Bounded: ≤4 workers, per-worker step budgets, an overall run clock.
 */

export type OrchestratorWorkerRole = "research" | "build" | "test";

export const OrchestratorToolName = "orchestrator";

export interface OrchestratorWorkerPlan {
  key: string;
  role: OrchestratorWorkerRole;
  name: string;
  task: string;
  dependsOn?: string[];
}

export interface OrchestratorWorkerResult {
  key: string;
  name: string;
  role: OrchestratorWorkerRole;
  status: "succeeded" | "failed";
  summary: string;
  attempts: number;
  toolCallCount: number;
}

export type OrchestratorToolOutput =
  | {
      status: "planning";
      runId: string;
      objective: string;
      workers: Array<{ key: string; name: string; role: string }>;
    }
  | {
      status: "worker-running";
      workerKey: string;
      workerName: string;
      role: string;
      message: UIMessage;
    }
  | {
      status: "worker-done";
      workerKey: string;
      workerName: string;
      role: string;
      workerStatus: "succeeded" | "failed";
      summary: string;
      attempts: number;
    }
  | { status: "verifying"; criteria: string }
  | {
      status: "verification";
      passed: boolean;
      summary: string;
      failedChecks: string[];
    }
  | {
      status: "done";
      runId: string;
      objective: string;
      workers: OrchestratorWorkerResult[];
      report: string;
      verification: {
        passed: boolean;
        summary: string;
        failedChecks: string[];
      } | null;
    }
  | { status: "failed"; error: string; runId?: string };

const MAX_WORKERS = 4;
const WORKER_STEPS = 14;
const OVERALL_RUN_MS = 6 * 60 * 1000;
const MAX_PROMPT_CHARS = 20_000;

const SHARED_WORKER_RULES = `Finish with a clear, self-contained summary of
what you did and found: concrete values, names, URLs, and file paths. That
summary is the ONLY thing returned to the orchestrator, so it must stand
alone. If you cannot complete the task, say so plainly and say why.`;

const ROLE_INSTRUCTIONS: Record<
  OrchestratorWorkerRole,
  { title: string; system: string }
> = {
  research: {
    title: "Research & Inspect",
    system: `You are the 06A Research & Inspect worker in a multi-agent build.
Your mission: gather the facts, inspect the provided material, and establish
what is true before anything is built. Use ONLY read-only tools (web search,
web content extraction, knowledge-base search, HTTP fetch). Do not attempt to
change anything.

${SHARED_WORKER_RULES}`,
  },
  build: {
    title: "Build & Modify",
    system: `You are the 06B Build & Modify worker in a multi-agent build.
Your mission: produce the working artifact the task describes — inside the
sandboxed execution tools you have (cloud sandbox for web apps, code
execution for scripts). Build it, run it, and confirm it actually works
before reporting. Include the preview URL or file path in your summary.

${SHARED_WORKER_RULES}`,
  },
  test: {
    title: "Test & Analyze",
    system: `You are the 06C Test & Analyze worker in a multi-agent build.
Your mission: verify the build outputs against the criteria you are given.
Exercise what was built (fetch the preview URL, run the verification script
in the sandbox), then report per criterion: PASS or FAIL with concrete
evidence. Start your final summary with a line "VERDICT: PASS" or
"VERDICT: FAIL" followed by the per-criterion results.

${SHARED_WORKER_RULES}`,
  },
};

function workerToolset(
  role: OrchestratorWorkerRole,
  deps: { customerId?: string; entityId?: string; projectId?: string },
): Record<string, Tool> {
  // Role-scoped instances built fresh per worker: each lane gets ONLY the
  // tools its role needs (research = read-only; build/test = sandboxed write
  // scope). Static registry instances + per-request factories.
  const httpFetch = httpFetchTool;
  const sandbox = e2bSandboxTool;
  const js = jsExecutionTool;
  const python = pythonExecutionTool;
  if (role === "research") {
    return {
      webSearch: createExaSearchTool(deps.customerId, deps.entityId),
      webContent: createExaContentsTool(deps.customerId, deps.entityId),
      searchKnowledgeBase: searchKnowledgeBase(deps.customerId, deps.projectId),
      httpFetch,
    };
  }
  if (role === "build") {
    return {
      sandbox,
      javascriptExecution: js,
      pythonExecution: python,
      httpFetch,
    };
  }
  // test
  return {
    javascriptExecution: js,
    pythonExecution: python,
    sandbox,
    httpFetch,
  };
}

const workerSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[a-z0-9-]+$/i)
    .describe("Unique short key for this worker, e.g. 06a"),
  role: z
    .enum(["research", "build", "test"])
    .describe(
      "research = read-only fact gathering; build = produce the artifact in the sandbox; test = verify outputs against criteria",
    ),
  name: z.string().min(1).max(80).describe("Display name, e.g. Research Agent"),
  task: z
    .string()
    .min(1)
    .max(8_000)
    .describe("Self-contained task with ALL context the worker needs"),
  dependsOn: z
    .array(z.string().max(24))
    .max(3)
    .optional()
    .describe("Keys of workers that must finish before this worker starts"),
});

/** Topological waves keep independent workers parallel while honoring prerequisites. */
export function planWorkerWaves<
  T extends Pick<OrchestratorWorkerPlan, "key" | "dependsOn">,
>(workers: T[]): T[][] {
  const byKey = new Map(workers.map((worker) => [worker.key, worker]));
  if (byKey.size !== workers.length)
    throw new Error("Worker keys must be unique");
  for (const worker of workers) {
    for (const key of worker.dependsOn ?? []) {
      if (key === worker.key || !byKey.has(key)) {
        throw new Error(`Invalid dependency ${key} for worker ${worker.key}`);
      }
    }
  }
  const done = new Set<string>();
  const waves: T[][] = [];
  while (done.size < workers.length) {
    const wave = workers.filter(
      (worker) =>
        !done.has(worker.key) &&
        (worker.dependsOn ?? []).every((key) => done.has(key)),
    );
    if (!wave.length) throw new Error("Worker dependencies contain a cycle");
    waves.push(wave);
    for (const worker of wave) done.add(worker.key);
  }
  return waves;
}

export const orchestratorSchema = z
  .object({
    objective: z
      .string()
      .min(1)
      .max(4_000)
      .optional()
      .describe(
        "The overall objective; required for a new run, loaded from the checkpoint when resuming",
      ),
    resumeRunId: z
      .string()
      .uuid()
      .optional()
      .describe("Resume a prior checkpoint belonging to this user and chat"),
    workers: z
      .array(workerSchema)
      .min(1)
      .max(MAX_WORKERS)
      .optional()
      .describe(
        "Optional worker team. Omit to let the orchestrator plan workers from the objective.",
      ),
    verificationCriteria: z
      .string()
      .max(4_000)
      .optional()
      .describe(
        "When set: after the build workers finish, a Test & Analyze worker verifies the outputs against these criteria and the result is reported. Repaired is not verified.",
      ),
  })
  .superRefine((input, context) => {
    if (!input.resumeRunId && !input.objective?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["objective"],
        message: "Objective is required for a new run",
      });
    }
  });

export interface OrchestratorDeps {
  model: LanguageModel;
  userId?: string;
  customerId?: string;
  entityId?: string;
  projectId?: string;
  organizationId?: string;
  threadId?: string;
  modelId?: string;
}

interface WorkerFrameSink {
  push: (frame: OrchestratorToolOutput) => void;
  next: () => Promise<OrchestratorToolOutput | null>;
  close: () => void;
}

/** A tiny push/pull queue so parallel workers interleave their frames. */
function createFrameSink(): WorkerFrameSink {
  const queue: OrchestratorToolOutput[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push: (frame) => {
      if (closed) return;
      queue.push(frame);
      const w = wake;
      wake = null;
      w?.();
    },
    next: () =>
      new Promise((resolve) => {
        if (queue.length) {
          resolve(queue.shift() ?? null);
          return;
        }
        if (closed) {
          resolve(null);
          return;
        }
        wake = () => {
          if (queue.length) resolve(queue.shift() ?? null);
          else resolve(null);
        };
      }),
    close: () => {
      closed = true;
      const w = wake;
      wake = null;
      w?.();
    },
  };
}

async function collectSummary(message: UIMessage | undefined): Promise<string> {
  let summary = "";
  for (const part of message?.parts ?? []) {
    if (part.type === "text" && part.text.trim()) {
      summary = part.text.trim();
    }
  }
  return summary;
}

function countToolCalls(message: UIMessage | undefined): number {
  return (
    message?.parts.filter((part) => part.type.startsWith("tool-")).length ?? 0
  );
}

/**
 * One worker lane: an inner role-scoped agent with a single retry. Streams
 * its UIMessage frames into the sink; resolves to the consolidated result.
 */
async function runWorker(
  sink: WorkerFrameSink,
  plan: OrchestratorWorkerPlan,
  deps: OrchestratorDeps,
  signal: AbortSignal | undefined,
): Promise<OrchestratorWorkerResult> {
  const role = ROLE_INSTRUCTIONS[plan.role];
  let attempts = 0;
  let lastError = "";

  // One retry with the failure reason attached — the master prompt's
  // "retry or delegate failed tasks".
  while (attempts < 2) {
    attempts += 1;
    const retryNote =
      attempts > 1
        ? `\n\nRETRY (attempt ${attempts}). Your previous attempt failed with:\n${lastError}\nFix that specific problem and try again.`
        : "";
    const task = `${plan.task}${retryNote}`.slice(0, MAX_PROMPT_CHARS);

    try {
      const result = streamText({
        model: deps.model,
        system: `${role.system}\n\nWorker key: ${plan.key}. Worker name: ${plan.name}.`,
        prompt: task,
        tools: workerToolset(plan.role, {
          customerId: deps.customerId,
          entityId: deps.entityId,
          projectId: deps.projectId,
        }),
        stopWhen: stepCountIs(WORKER_STEPS),
        abortSignal: signal,
        maxRetries: 0,
        experimental_telemetry: aiTelemetry("chat.orchestrator-worker", {
          organizationId: deps.organizationId,
          threadId: deps.threadId,
          modelId: deps.modelId,
          workerKey: plan.key,
          workerRole: plan.role,
        }),
      });

      let lastMessage: UIMessage | undefined;
      for await (const message of readUIMessageStream({
        stream: toUIMessageStream({ stream: result.fullStream }),
      })) {
        lastMessage = message;
        sink.push({
          status: "worker-running",
          workerKey: plan.key,
          workerName: plan.name,
          role: plan.role,
          message,
        });
      }

      const summary = (await collectSummary(lastMessage)).slice(
        0,
        MAX_PROMPT_CHARS,
      );
      if (!summary) {
        lastError = "The worker finished without a summary.";
        continue;
      }
      const workerResult: OrchestratorWorkerResult = {
        key: plan.key,
        name: plan.name,
        role: plan.role,
        status: "succeeded",
        summary,
        attempts,
        toolCallCount: countToolCalls(lastMessage),
      };
      sink.push({
        status: "worker-done",
        workerKey: plan.key,
        workerName: plan.name,
        role: plan.role,
        workerStatus: "succeeded",
        summary,
        attempts,
      });
      return workerResult;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (signal?.aborted) {
        break;
      }
    }
  }

  sink.push({
    status: "worker-done",
    workerKey: plan.key,
    workerName: plan.name,
    role: plan.role,
    workerStatus: "failed",
    summary: lastError,
    attempts,
  });
  return {
    key: plan.key,
    name: plan.name,
    role: plan.role,
    status: "failed",
    summary: lastError || "The worker failed without a reason.",
    attempts,
    toolCallCount: 0,
  };
}

/** Parses the verification worker's "VERDICT: PASS/FAIL" convention. */
function parseVerification(summary: string): {
  passed: boolean;
  failedChecks: string[];
} {
  const verdict = /VERDICT:\s*(PASS|FAIL)/i.exec(summary);
  const passed = verdict
    ? verdict[1].toUpperCase() === "PASS"
    : /all .*pass/i.test(summary);
  const failedChecks = summary
    .split("\n")
    .filter((line) => /^\s*[-*]?\s*FAIL\b/i.test(line))
    .map((line) => line.trim());
  return { passed, failedChecks };
}

export const createOrchestratorTool = (deps: OrchestratorDeps) =>
  createTool<
    z.infer<typeof orchestratorSchema>,
    OrchestratorToolOutput,
    Record<string, unknown>
  >({
    description: `Run a WORKER TEAM in parallel to achieve an objective end to end: you decompose the objective into role-scoped tasks, the workers execute concurrently, and you get a consolidated report with an optional verification gate.

Workers (max ${MAX_WORKERS}):
- research: read-only fact gathering (web, knowledge base, HTTP)
- build: produces the artifact inside the sandboxed execution tools (web apps, scripts)
- test: verifies outputs against criteria

Use this when the objective genuinely needs MULTIPLE specialists working at
once (research + build + test, or several independent build pieces). Do NOT
use it for a single-step task you can do directly. Keep worker tasks
independent and self-contained when possible. Use dependsOn keys only when a
worker truly needs another worker's result: independent workers run in parallel,
and dependent workers receive prerequisite summaries after those workers finish.
Omit workers when you want the orchestrator to decompose the objective itself.
When you provide verificationCriteria, a Test
worker independently checks the build outputs against them after the build
finishes (repaired is not verified). Checkpoints are saved between dependency
waves. If a run fails, resume with its runId and resumeRunId; only unfinished
or failed workers rerun.`,
    inputSchema: orchestratorSchema,
    execute: async function* (
      {
        objective: requestedObjective,
        workers: suppliedWorkers,
        verificationCriteria: requestedVerificationCriteria,
        resumeRunId,
      },
      { abortSignal },
    ) {
      const runSignal = AbortSignal.any([
        ...(abortSignal ? [abortSignal] : []),
        AbortSignal.timeout(OVERALL_RUN_MS),
      ]);
      const runId = resumeRunId ?? generateUUID();
      let objective = requestedObjective ?? "";
      let verificationCriteria = requestedVerificationCriteria;
      let workers = suppliedWorkers;
      let workerResults: OrchestratorWorkerResult[] = [];

      if (!deps.userId || !deps.threadId) {
        yield {
          status: "failed" as const,
          error:
            "Orchestrator checkpoints require an authenticated chat thread",
        };
        return;
      }

      if (resumeRunId) {
        try {
          const checkpoint = await getOrchestratorCheckpoint({
            id: resumeRunId,
            userId: deps.userId,
            threadId: deps.threadId,
          });
          if (!checkpoint) {
            yield {
              status: "failed" as const,
              runId,
              error:
                "No resumable orchestration checkpoint was found for this chat",
            };
            return;
          }
          if (checkpoint.status === "done") {
            yield {
              status: "failed" as const,
              runId,
              error: "This orchestration checkpoint is already complete",
            };
            return;
          }
          objective = checkpoint.objective;
          workers = checkpoint.workers as OrchestratorWorkerPlan[];
          workerResults =
            checkpoint.completedWorkers as OrchestratorWorkerResult[];
          verificationCriteria =
            requestedVerificationCriteria ??
            checkpoint.verificationCriteria ??
            undefined;
        } catch (error) {
          yield {
            status: "failed" as const,
            runId,
            error: `Unable to load checkpoint: ${error instanceof Error ? error.message : String(error)}`,
          };
          return;
        }
      } else if (!workers) {
        try {
          const planned = await generateText({
            model: deps.model,
            abortSignal: runSignal,
            prompt: `Decompose this objective into 1-${MAX_WORKERS} role-scoped workers. Use research, build, and test roles. Give each a concrete self-contained task. Use dependsOn only where one worker needs another's output. Keep independent tasks parallel.\n\nObjective: ${objective}\nVerification criteria: ${verificationCriteria ?? "none"}`,
            output: Output.object({
              schema: z.object({
                workers: z.array(workerSchema).min(1).max(MAX_WORKERS),
              }),
            }),
          });
          workers = planned.output.workers;
        } catch (error) {
          yield {
            status: "failed" as const,
            error: `Unable to plan workers: ${error instanceof Error ? error.message : String(error)}`,
          };
          return;
        }
      }
      if (!workers) {
        yield {
          status: "failed" as const,
          error: "No worker plan was available",
        };
        return;
      }
      try {
        planWorkerWaves(workers);
      } catch (error) {
        yield {
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        };
        return;
      }
      if (!resumeRunId) {
        try {
          await createOrchestratorCheckpoint({
            id: runId,
            userId: deps.userId,
            threadId: deps.threadId,
            objective,
            workers: workers as StoredOrchestratorWorker[],
            verificationCriteria,
          });
        } catch (error) {
          yield {
            status: "failed" as const,
            runId,
            error: `Unable to save orchestration checkpoint: ${error instanceof Error ? error.message : String(error)}`,
          };
          return;
        }
      }
      yield {
        status: "planning" as const,
        runId,
        objective,
        workers: workers.map((w) => ({
          key: w.key,
          name: w.name,
          role: w.role,
        })),
      };

      const sink = createFrameSink();
      // Overall run clock: bounded like the unattended browser path.

      try {
        const allWorkers = (async () => {
          const completed = new Map<string, OrchestratorWorkerResult>(
            workerResults.map((result) => [result.key, result]),
          );
          for (const wave of planWorkerWaves(workers)) {
            const results = await Promise.all(
              wave.map(async (plan) => {
                const saved = completed.get(plan.key);
                if (saved?.status === "succeeded") {
                  sink.push({
                    status: "worker-done",
                    workerKey: saved.key,
                    workerName: saved.name,
                    role: saved.role,
                    workerStatus: saved.status,
                    summary: saved.summary,
                    attempts: saved.attempts,
                  });
                  return saved;
                }
                const prerequisites = (plan.dependsOn ?? [])
                  .map((key) => completed.get(key))
                  .filter((result): result is OrchestratorWorkerResult =>
                    Boolean(result),
                  );
                const failed = prerequisites.find(
                  (result) => result.status === "failed",
                );
                if (failed) {
                  const result: OrchestratorWorkerResult = {
                    key: plan.key,
                    name: plan.name,
                    role: plan.role,
                    status: "failed",
                    summary: `Prerequisite ${failed.name} failed; worker did not run`,
                    attempts: 0,
                    toolCallCount: 0,
                  };
                  sink.push({
                    status: "worker-done",
                    workerKey: plan.key,
                    workerName: plan.name,
                    role: plan.role,
                    workerStatus: "failed",
                    summary: result.summary,
                    attempts: 0,
                  });
                  return result;
                }
                const handoff = prerequisites.length
                  ? `\n\nPrerequisite worker results:\n${prerequisites
                      .map((result) => `[${result.name}] ${result.summary}`)
                      .join("\n\n")}`.slice(0, MAX_PROMPT_CHARS)
                  : "";
                return runWorker(
                  sink,
                  { ...plan, task: `${plan.task}${handoff}` },
                  deps,
                  runSignal,
                );
              }),
            );
            for (const result of results) {
              completed.set(result.key, result);
              const existingIndex = workerResults.findIndex(
                (saved) => saved.key === result.key,
              );
              if (existingIndex < 0) workerResults.push(result);
              else workerResults[existingIndex] = result;
            }
            await saveOrchestratorCheckpoint({
              id: runId,
              userId: deps.userId as string,
              threadId: deps.threadId as string,
              completedWorkers: workerResults as StoredOrchestratorResult[],
              status: "running",
            });
          }
          return workerResults;
        })();

        // Drain interleaved worker frames until every lane finishes.
        let open = workers.length;
        const drain = (async () => {
          await allWorkers;
          sink.close();
        })();
        drain.catch(() => sink.close());

        while (true) {
          const frame = await sink.next();
          if (!frame) break;
          if (frame.status === "worker-done") open -= 1;
          yield frame;
          if (open <= 0) {
            await allWorkers;
            const tail = await sink.next();
            if (!tail) break;
            if (tail.status === "worker-done") open -= 1;
            yield tail;
          }
        }
        await allWorkers;

        // Verification gate (Stage 08 — repaired ≠ verified).
        let verification: {
          passed: boolean;
          summary: string;
          failedChecks: string[];
        } | null = null;
        if (
          verificationCriteria?.trim() &&
          workerResults.some(
            (w) => w.role === "build" && w.status === "succeeded",
          )
        ) {
          await saveOrchestratorCheckpoint({
            id: runId,
            userId: deps.userId,
            threadId: deps.threadId,
            completedWorkers: workerResults as StoredOrchestratorResult[],
            status: "verifying",
          });
          yield {
            status: "verifying" as const,
            criteria: verificationCriteria,
          };
          const buildSummaries = workerResults
            .filter((w) => w.role === "build")
            .map((w) => `[${w.name}] ${w.summary}`)
            .join("\n\n");
          const verifyPlan: OrchestratorWorkerPlan = {
            key: "verify",
            role: "test",
            name: "Verification Agent",
            task: `Verify the build outputs against these criteria:\n${verificationCriteria}\n\nBuild worker reports:\n${buildSummaries.slice(0, MAX_PROMPT_CHARS)}`,
          };
          const verifyResult = await runWorker(
            sink,
            verifyPlan,
            deps,
            runSignal,
          );
          const parsed = parseVerification(verifyResult.summary);
          verification = {
            passed: verifyResult.status === "succeeded" && parsed.passed,
            summary: verifyResult.summary,
            failedChecks: parsed.failedChecks,
          };
          yield {
            status: "verification" as const,
            passed: verification.passed,
            summary: verification.summary,
            failedChecks: verification.failedChecks,
          };
        }

        const failedWorkers = workerResults.filter(
          (w) => w.status === "failed",
        );
        const report = [
          `Objective: ${objective}`,
          "",
          ...workerResults.map(
            (w) =>
              `[${w.role}] ${w.name}: ${w.status.toUpperCase()} (attempts ${w.attempts})\n${w.summary}`,
          ),
          verification
            ? `\nVerification: ${verification.passed ? "PASSED" : "FAILED"}\n${verification.summary}`
            : "",
          failedWorkers.length
            ? `\nFailed workers: ${failedWorkers.map((w) => w.name).join(", ")} — their tasks are NOT done.`
            : "",
          failedWorkers.length || (verification && !verification.passed)
            ? `\nResume ID: ${runId}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        await saveOrchestratorCheckpoint({
          id: runId,
          userId: deps.userId,
          threadId: deps.threadId,
          completedWorkers: workerResults as StoredOrchestratorResult[],
          status:
            failedWorkers.length || (verification && !verification.passed)
              ? "failed"
              : "done",
        });

        yield {
          status: "done" as const,
          runId,
          objective,
          workers: workerResults,
          report,
          verification,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await saveOrchestratorCheckpoint({
          id: runId,
          userId: deps.userId,
          threadId: deps.threadId,
          completedWorkers: workerResults as StoredOrchestratorResult[],
          status: "failed",
        }).catch((checkpointError) => {
          globalLogger.warn(
            "Could not save failed orchestrator checkpoint",
            checkpointError,
          );
        });
        yield { status: "failed" as const, runId, error: message };
      }
    },
    toModelOutput: ({ output }) => ({
      type: "text",
      value:
        output.status === "done"
          ? output.report
          : output.status === "failed"
            ? `The orchestration failed: ${output.error}${output.runId ? ` Resume ID: ${output.runId}` : ""}`
            : output.status === "verification"
              ? `Verification ${output.passed ? "PASSED" : "FAILED"}: ${output.summary}`
              : "Worker team in progress.",
    }),
  });
