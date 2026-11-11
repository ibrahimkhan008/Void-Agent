import { describe, expect, it, vi } from "vitest";
import { finalizeChatRunWithRecovery } from "./finalize-chat-run-with-recovery";

describe("finalizeChatRunWithRecovery", () => {
  const metadata = { runId: "user-1", runStatus: "running" as const };

  it("retries terminal persistence without rerunning generation", async () => {
    const finalize = vi.fn().mockRejectedValueOnce(new Error("temporary"));
    const persistFailure = vi.fn();
    const onFinalizationError = vi.fn();

    await expect(
      finalizeChatRunWithRecovery({
        metadata,
        finalize,
        persistFailure,
        onFinalizationError,
        onPersistenceError: vi.fn(),
      }),
    ).resolves.toBe(true);

    expect(finalize).toHaveBeenCalledTimes(2);
    expect(onFinalizationError).toHaveBeenCalledTimes(1);
    expect(persistFailure).not.toHaveBeenCalled();
  });

  it("marks persistence unrecoverable after two terminal write failures", async () => {
    const finalize = vi
      .fn()
      .mockRejectedValue(new Error("database unavailable"));
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      finalizeChatRunWithRecovery({
        metadata,
        finalize,
        persistFailure,
        onFinalizationError: vi.fn(),
        onPersistenceError: vi.fn(),
      }),
    ).resolves.toBe(false);

    expect(finalize).toHaveBeenCalledTimes(2);
    expect(persistFailure).toHaveBeenCalledWith({
      ...metadata,
      runStatus: "failed",
      error: { code: "persistence_failed", retryable: false },
    });
  });

  it("does not let diagnostics prevent failure persistence", async () => {
    const onFinalizationError = vi.fn(() => {
      throw new Error("logger failed");
    });
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      finalizeChatRunWithRecovery({
        metadata,
        finalize: vi.fn().mockRejectedValue(new Error("write failed")),
        persistFailure,
        onFinalizationError,
        onPersistenceError: vi.fn(),
      }),
    ).resolves.toBe(false);

    expect(persistFailure).toHaveBeenCalledOnce();
  });
});
