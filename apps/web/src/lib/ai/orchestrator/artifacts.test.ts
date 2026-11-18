import { describe, expect, it } from "vitest";
import {
  MAX_ARTIFACT_CHARS,
  MAX_WORKER_ARTIFACTS,
  addWorkerArtifact,
  consolidateWorkerArtifacts,
  validateArtifactPath,
} from "./artifacts";

describe("orchestrator worker artifacts", () => {
  it("accepts bounded relative paths and rejects traversal and secret files", () => {
    expect(validateArtifactPath("reports/summary.md")).toBe(
      "reports/summary.md",
    );
    for (const path of [
      "../escape.txt",
      "/absolute.txt",
      "a\\b",
      ".env",
      ".env.production.local",
      "credentials.json",
    ]) {
      expect(() => validateArtifactPath(path)).toThrow();
    }
  });

  it("bounds each worker file count and content size", () => {
    const files = new Map<string, string>();
    expect(addWorkerArtifact(files, "one.txt", "hello")).toEqual({
      path: "one.txt",
      characters: 5,
    });
    expect(() =>
      addWorkerArtifact(files, "large.txt", "x".repeat(MAX_ARTIFACT_CHARS + 1)),
    ).toThrow("Each artifact is limited");
    for (let index = 1; index < MAX_WORKER_ARTIFACTS; index += 1) {
      addWorkerArtifact(files, `file-${index}.txt`, "x");
    }
    expect(() => addWorkerArtifact(files, "too-many.txt", "x")).toThrow(
      "at most",
    );

    const oversized = new Map<string, string>();
    addWorkerArtifact(oversized, "part-a.txt", "x".repeat(32_000));
    addWorkerArtifact(oversized, "part-b.txt", "y".repeat(32_000));
    expect(() => addWorkerArtifact(oversized, "part-c.txt", "z")).toThrow(
      "characters total",
    );
  });

  it("consolidates parallel worker outputs and deduplicates identical writes", () => {
    const result = consolidateWorkerArtifacts([
      {
        key: "a",
        name: "Researcher",
        status: "succeeded",
        artifacts: [{ path: "report.md", content: "report" }],
      },
      {
        key: "b",
        name: "Writer",
        status: "succeeded",
        artifacts: [
          { path: "report.md", content: "report" },
          { path: "data.csv", content: "value\n1" },
        ],
      },
      {
        key: "c",
        name: "Failed worker",
        status: "failed",
        artifacts: [{ path: "ignored.txt", content: "not delivered" }],
      },
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.artifacts.map((item) => item.path)).toEqual([
      "data.csv",
      "report.md",
    ]);
    expect(result.artifacts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "ignored.txt" }),
      ]),
    );
  });

  it("withholds conflicting paths and reports every writer", () => {
    const result = consolidateWorkerArtifacts([
      {
        key: "a",
        name: "Writer A",
        status: "succeeded",
        artifacts: [{ path: "same.md", content: "first" }],
      },
      {
        key: "b",
        name: "Writer B",
        status: "succeeded",
        artifacts: [{ path: "same.md", content: "second" }],
      },
      {
        key: "c",
        name: "Writer C",
        status: "succeeded",
        artifacts: [{ path: "same.md", content: "third" }],
      },
    ]);

    expect(result.artifacts).toEqual([]);
    expect(result.conflicts).toEqual([
      { path: "same.md", workers: ["Writer A", "Writer B", "Writer C"] },
    ]);
  });
});
