import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Orchestrator crash/recovery drill against the isolated PostgreSQL cluster
 * (master prompt §3.2/3.4 closure): a real run fails mid-way, the checkpoint
 * persists the completed/failed workers, and a resume claims it atomically,
 * reuses the succeeded worker WITHOUT re-executing it, retries the failed
 * one, re-runs the verification gate, and lands the run on "done". The model
 * is injected (OrchestratorDeps.model), so a controlled LanguageModel drives
 * every worker — no live AI provider key is involved. Worker sandbox tool
 * execution is not part of this drill: E2B execution was live-verified
 * separately (App Builder closure), and the orchestrator core never calls
 * the sandbox itself.
 */

vi.mock("server-only", () => ({}));

import { pgClient, pgDb } from "../../db/pg/db.pg";
import {
  ChatThreadTable,
  OrchestratorCheckpointTable,
  UserTable,
} from "../../db/pg/schema.pg";
import { createOrchestratorTool } from "./orchestrator";

const configuredUrl = process.env.TEST_POSTGRES_URL;
const isAllowedIsolatedDb = (() => {
  if (!configuredUrl) return false;
  try {
    const parsed = new URL(configuredUrl);
    return (
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
      parsed.port === "55432" &&
      parsed.pathname === "/voidagent_migration_test" &&
      Number(process.env.POSTGRES_POOL_MAX ?? 1) >= 2
    );
  } catch {
    return false;
  }
})();

const integration = isAllowedIsolatedDb ? describe : describe.skip;

const userId = crypto.randomUUID();
const threadId = crypto.randomUUID();

const WORKERS = [
  {
    key: "build-a",
    role: "build" as const,
    name: "Inventory Builder",
    task: "Write the inventory module",
  },
  {
    key: "test-b",
    role: "test" as const,
    name: "Inventory Tester",
    task: "Test the inventory module",
  },
];
const CRITERIA = "The inventory module counts rows correctly.";

const textChunks = (text: string) => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
];

/**
 * Scripted worker behavior:
 * - builder prompt -> always succeeds with a concrete summary;
 * - tester prompt -> the first TWO calls crash the stream (the drill's
 *   mid-run failure), every later call succeeds (the resume retry);
 * - verifier prompt -> "VERDICT: PASS".
 */
const makeControlledModel = () => {
  const state = { prompts: [] as string[], testerCalls: 0 };
  const model: any = {
    specificationVersion: "v2",
    provider: "controlled-orchestrator-provider",
    modelId: "controlled-orchestrator-model",
    supportedUrls: {},
    doStream: vi.fn(async (options: { prompt: unknown }) => {
      const prompt =
        typeof options.prompt === "string"
          ? options.prompt
          : JSON.stringify(options.prompt);
      state.prompts.push(prompt);
      const chunks: Array<Record<string, unknown>> = [
        { type: "stream-start", warnings: [] },
      ];
      if (prompt.includes("Verify the build outputs")) {
        chunks.push(
          ...textChunks(
            "Checked every criterion against the build reports.\nVERDICT: PASS",
          ),
        );
      } else if (prompt.includes("Test the inventory module")) {
        state.testerCalls += 1;
        if (state.testerCalls <= 2) {
          // A real provider crash surfaces as the stream erroring, not as an
          // error part: the UI stream's default onError would convert an
          // error part into summary text and the worker would "succeed".
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "stream-start", warnings: [] });
                controller.error(new Error("tester worker crashed mid-run"));
              },
            }),
          };
        }
        chunks.push(
          ...textChunks(
            "Ran the inventory suite: 4/4 tests pass. No regressions found.",
          ),
        );
      } else {
        chunks.push(
          ...textChunks(
            "Wrote src/inventory.ts exporting countInventory(rows): number. Counted 12 rows correctly.",
          ),
        );
      }
      chunks.push({
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
      };
    }),
  };
  return {
    model,
    callsFor: (needle: string) =>
      state.prompts.filter((prompt) => prompt.includes(needle)).length,
  };
};

type ControlledModel = ReturnType<typeof makeControlledModel>;

integration("Orchestrator crash/recovery drill (isolated PostgreSQL)", () => {
  let controlled: ControlledModel;

  beforeAll(async () => {
    if (configuredUrl && !isAllowedIsolatedDb) {
      throw new Error(
        "Use only loopback voidagent_migration_test on port 55432 with POSTGRES_POOL_MAX >= 2",
      );
    }
    await pgDb.insert(UserTable).values({
      id: userId,
      name: "Orchestrator drill owner",
      email: `${userId}@test.invalid`,
    });
    await pgDb.insert(ChatThreadTable).values({
      id: threadId,
      userId,
      title: "Orchestrator resume drill thread",
    });
    controlled = makeControlledModel();
  });

  afterAll(async () => {
    if (isAllowedIsolatedDb) {
      await pgDb.delete(UserTable).where(eq(UserTable.id, userId));
      await pgClient.end({ timeout: 5 });
    }
  });

  async function run(input: Record<string, unknown>) {
    const tool = createOrchestratorTool({
      model: controlled.model,
      userId,
      threadId,
      modelId: "controlled/orchestrator-model",
    });
    const frames: Array<Record<string, unknown>> = [];
    for await (const frame of (tool as any).execute(input, {})) {
      frames.push(frame);
    }
    return frames;
  }

  it("persists a failed run with the completed and failed workers", async () => {
    const frames = await run({
      objective: "Ship the inventory feature",
      workers: WORKERS,
      verificationCriteria: CRITERIA,
    });

    const planning = frames.find((frame) => frame.status === "planning") as {
      runId: string;
      workers: Array<{ key: string }>;
    };
    expect(planning?.workers.map((worker) => worker.key)).toEqual([
      "build-a",
      "test-b",
    ]);

    const workerDone = frames.filter(
      (frame) => frame.status === "worker-done",
    ) as Array<{
      workerKey: string;
      workerStatus: string;
      attempts: number;
    }>;
    expect(workerDone).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerKey: "build-a",
          workerStatus: "succeeded",
          attempts: 1,
        }),
        expect.objectContaining({
          workerKey: "test-b",
          workerStatus: "failed",
          attempts: 2,
        }),
      ]),
    );

    // The verification gate ran even though the run failed (a build worker
    // succeeded), and the controlled verifier passed it.
    const verification = frames.find(
      (frame) => frame.status === "verification",
    ) as { passed: boolean } | undefined;
    expect(verification?.passed).toBe(true);

    // The tool's terminal frame is always "done" — the failure rides in the
    // report text and in the checkpoint status, not in the frame union.
    const terminal = frames[frames.length - 1] as {
      status: string;
      runId: string;
      report: string;
    };
    expect(terminal.status).toBe("done");
    expect(terminal.runId).toBe(planning.runId);
    expect(terminal.report).toContain("Inventory Tester");
    expect(terminal.report).toContain("NOT done");
    expect(terminal.report).toContain(`Resume ID: ${planning.runId}`);

    // The failed checkpoint is the resume anchor: completed + failed workers
    // persisted.
    const [checkpoint] = await pgDb
      .select()
      .from(OrchestratorCheckpointTable)
      .where(eq(OrchestratorCheckpointTable.id, planning.runId))
      .limit(1);
    expect(checkpoint.status).toBe("failed");
    expect(checkpoint.completedWorkers).toEqual([
      expect.objectContaining({ key: "build-a", status: "succeeded" }),
      expect.objectContaining({
        key: "test-b",
        status: "failed",
        attempts: 2,
      }),
    ]);

    // Model call ledger: builder once, tester twice (one retry), verifier once.
    expect(controlled.callsFor("Write the inventory module")).toBe(1);
    expect(controlled.callsFor("Test the inventory module")).toBe(2);
    expect(controlled.callsFor("Verify the build outputs")).toBe(1);

    // Stash the run id for the resume test.
    process.env.DRILL_RUN_ID = planning.runId;
  });

  it("resumes the checkpoint: reuses the succeeded worker, retries the failed one, lands on done", async () => {
    const runId = process.env.DRILL_RUN_ID as string;
    expect(runId).toBeTruthy();
    const builderCallsBefore = controlled.callsFor(
      "Write the inventory module",
    );

    const frames = await run({
      objective: "Ship the inventory feature",
      resumeRunId: runId,
      verificationCriteria: CRITERIA,
    });

    const done = frames[frames.length - 1] as {
      status: string;
      workers: Array<{ key: string; status: string }>;
      verification: { passed: boolean } | null;
      runId: string;
    };
    expect(done.status).toBe("done");
    expect(done.runId).toBe(runId);
    expect(done.workers).toEqual([
      expect.objectContaining({ key: "build-a", status: "succeeded" }),
      expect.objectContaining({ key: "test-b", status: "succeeded" }),
    ]);
    expect(done.verification?.passed).toBe(true);

    // The succeeded worker was reused, not re-executed: no new model call
    // for the builder task across the resume.
    expect(controlled.callsFor("Write the inventory module")).toBe(
      builderCallsBefore,
    );
    // The failed worker ran exactly once more (its third call overall) and
    // the controlled model lets it through this time.
    expect(controlled.callsFor("Test the inventory module")).toBe(3);
    // The verification gate re-ran on the resumed run.
    expect(controlled.callsFor("Verify the build outputs")).toBe(2);

    const [checkpoint] = await pgDb
      .select()
      .from(OrchestratorCheckpointTable)
      .where(eq(OrchestratorCheckpointTable.id, runId))
      .limit(1);
    expect(checkpoint.status).toBe("done");
    expect(checkpoint.completedWorkers).toHaveLength(2);
    for (const worker of checkpoint.completedWorkers) {
      expect(worker.status).toBe("succeeded");
    }
  });
});
