import { describe, expect, it, vi } from "vitest";
import { persistFailedChatRun } from "./persist-failed-chat-run";

describe("persistFailedChatRun", () => {
  it("stores a retryable generic failure without exposing provider details", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const metadata = { runId: "user-1", runStatus: "running" as const };

    await expect(
      persistFailedChatRun({
        metadata,
        persist,
        onPersistenceError: vi.fn(),
      }),
    ).resolves.toEqual({
      ...metadata,
      runStatus: "failed",
      error: { code: "generation_failed", retryable: true },
    });
    expect(persist).toHaveBeenCalledWith({
      ...metadata,
      runStatus: "failed",
      error: { code: "generation_failed", retryable: true },
    });
  });

  it("persists timeout as a retryable terminal state", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    await persistFailedChatRun({
      metadata: { runId: "user-1", runStatus: "running" },
      failure: { runStatus: "timed_out", code: "timed_out" },
      persist,
      onPersistenceError: vi.fn(),
    });
    expect(persist).toHaveBeenCalledWith({
      runId: "user-1",
      runStatus: "timed_out",
      error: { code: "timed_out", retryable: true },
    });
  });

  it("does not throw when failure persistence and its logger fail", async () => {
    const onPersistenceError = vi.fn(() => {
      throw new Error("logger failed");
    });
    await expect(
      persistFailedChatRun({
        metadata: { runId: "user-1", runStatus: "running" },
        persist: vi.fn().mockRejectedValue(new Error("database unavailable")),
        onPersistenceError,
      }),
    ).resolves.toMatchObject({
      runStatus: "failed",
      error: { code: "generation_failed", retryable: true },
    });
    expect(onPersistenceError).toHaveBeenCalledOnce();
  });
});
