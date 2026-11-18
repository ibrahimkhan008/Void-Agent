import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOrchestratorWorkerTools,
  orchestratorSchema,
  planWorkerWaves,
} from "./orchestrator";

describe("orchestratorSchema", () => {
  const worker = {
    key: "06a",
    role: "research" as const,
    name: "Research Agent",
    task: "Gather the facts",
  };

  it("accepts a valid plan with a verification gate", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "Build and verify a landing page",
      workers: [worker, { ...worker, key: "06b", role: "build" }],
      verificationCriteria: "The page renders a heading",
    });
    expect(parsed.success).toBe(true);
  });

  it("caps the worker team at 4", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: Array.from({ length: 5 }, (_, i) => ({
        ...worker,
        key: `w${i}`,
      })),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown roles", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [{ ...worker, role: "demolition" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects worker keys with path-hostile characters", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [{ ...worker, key: "../../etc" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires at least one worker", () => {
    const parsed = orchestratorSchema.safeParse({
      objective: "objective",
      workers: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows the orchestrator to plan workers from an objective", () => {
    expect(
      orchestratorSchema.safeParse({ objective: "Build a report" }).success,
    ).toBe(true);
  });

  it("requires an objective for a new run and accepts a scoped resume ID", () => {
    expect(orchestratorSchema.safeParse({}).success).toBe(false);
    expect(
      orchestratorSchema.safeParse({
        resumeRunId: "217c9e15-a2d5-4e68-9d2a-16bc1532ff56",
      }).success,
    ).toBe(true);
    expect(
      orchestratorSchema.safeParse({ resumeRunId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("worker dependency ordering", () => {
  it("runs independent workers together before their dependent worker", () => {
    const waves = planWorkerWaves([
      { key: "research" },
      { key: "build", dependsOn: ["research"] },
      { key: "inspect" },
      { key: "test", dependsOn: ["build"] },
    ]);
    expect(waves.map((wave) => wave.map((worker) => worker.key))).toEqual([
      ["research", "inspect"],
      ["build"],
      ["test"],
    ]);
  });

  it("rejects unknown dependencies and cycles", () => {
    expect(() =>
      planWorkerWaves([{ key: "a", dependsOn: ["missing"] }]),
    ).toThrow("Invalid dependency");
    expect(() =>
      planWorkerWaves([
        { key: "a", dependsOn: ["b"] },
        { key: "b", dependsOn: ["a"] },
      ]),
    ).toThrow("cycle");
  });
});

describe("write-capable worker fan-out", () => {
  it("writes into worker-local bundles and reads only handed-off prerequisites", async () => {
    const firstWorker = new Map<string, string>();
    const secondWorker = new Map<string, string>();
    const builderTools = createOrchestratorWorkerTools("build", {
      artifacts: firstWorker,
    });
    const independentBuilderTools = createOrchestratorWorkerTools("build", {
      artifacts: secondWorker,
    });

    await Promise.all([
      (builderTools.writeArtifact as any).execute(
        { path: "src/summary.md", content: "first worker output" },
        {},
      ),
      (independentBuilderTools.writeArtifact as any).execute(
        { path: "src/data.csv", content: "count\n2" },
        {},
      ),
    ]);

    expect(firstWorker.get("src/summary.md")).toBe("first worker output");
    expect(firstWorker.has("src/data.csv")).toBe(false);
    expect(secondWorker.has("src/summary.md")).toBe(false);

    const testTools = createOrchestratorWorkerTools("test", {
      inputArtifacts: firstWorker,
    });
    await expect(
      (testTools.readArtifact as any).execute({ path: "src/summary.md" }, {}),
    ).resolves.toEqual({
      found: true,
      path: "src/summary.md",
      content: "first worker output",
    });
    await expect(
      (testTools.readArtifact as any).execute({ path: "missing.txt" }, {}),
    ).resolves.toMatchObject({ found: false });
    expect(testTools.writeArtifact).toBeUndefined();
  });

  it("rejects unsafe paths and preserves the worker output bundle on failure", async () => {
    const artifacts = new Map<string, string>();
    const tools = createOrchestratorWorkerTools("build", { artifacts });
    await expect(
      (tools.writeArtifact as any).execute(
        { path: "../../secrets.txt", content: "no" },
        {},
      ),
    ).rejects.toThrow();
    expect(artifacts.size).toBe(0);
  });
});
