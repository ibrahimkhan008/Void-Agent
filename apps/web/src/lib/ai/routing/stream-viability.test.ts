import { describe, expect, it } from "vitest";
import { probeStreamViability } from "./stream-viability";

const streamOf = (parts: Array<{ type: string }>) =>
  new ReadableStream<{ type: string }>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });

describe("probeStreamViability", () => {
  it("reports a model error before any content as failed-before-output", async () => {
    const verdict = await probeStreamViability(
      streamOf([{ type: "start" }, { type: "start-step" }, { type: "error" }]),
    );
    expect(verdict).toBe("failed-before-output");
  });

  it("keeps probing past control frames before the error", async () => {
    const verdict = await probeStreamViability(
      streamOf([
        { type: "start" },
        { type: "finish-step" },
        { type: "start-step" },
        { type: "error" },
      ]),
    );
    expect(verdict).toBe("failed-before-output");
  });

  it("treats text content as viable", async () => {
    const verdict = await probeStreamViability(
      streamOf([{ type: "start" }, { type: "text-delta" }]),
    );
    expect(verdict).toBe("viable");
  });

  it("treats reasoning, tool input and data frames as viable", async () => {
    for (const type of [
      "reasoning-start",
      "reasoning-delta",
      "tool-input-start",
      "tool-call",
      "data-preview",
      "source-url",
      "file",
    ]) {
      expect(await probeStreamViability(streamOf([{ type }]))).toBe("viable");
    }
  });

  it("treats an error AFTER content as viable (mid-stream retry is unsafe)", async () => {
    const verdict = await probeStreamViability(
      streamOf([{ type: "text-delta" }, { type: "error" }]),
    );
    expect(verdict).toBe("viable");
  });

  it("treats a completed empty stream as viable (nothing to retry)", async () => {
    expect(
      await probeStreamViability(
        streamOf([{ type: "start" }, { type: "finish" }]),
      ),
    ).toBe("viable");
  });

  it("treats a user abort as viable", async () => {
    expect(await probeStreamViability(streamOf([{ type: "abort" }]))).toBe(
      "viable",
    );
  });

  it("treats an immediately-ended stream as failed-before-output", async () => {
    // streamText always emits a finish part on a normal completion, so a
    // zero-frame stream is an abnormal termination — retryable.
    expect(await probeStreamViability(streamOf([]))).toBe(
      "failed-before-output",
    );
  });

  it("treats a stream erroring without content as failed-before-output", async () => {
    // Providers surface failures by erroring the stream; the pump rejects
    // the read. No content ever flowed, so the attempt is retryable.
    const failing = new ReadableStream<{ type: string }>({
      start(controller) {
        controller.error(new Error("provider 500"));
      },
    });
    expect(await probeStreamViability(failing)).toBe("failed-before-output");
  });

  it("treats a bare end after control frames as failed-before-output", async () => {
    const verdict = await probeStreamViability(
      streamOf([{ type: "start" }, { type: "start-step" }]),
    );
    expect(verdict).toBe("failed-before-output");
  });

  it("accepts the ai package TextStreamPart shape", async () => {
    // TextStreamPart members carry type literals plus extra fields; the
    // probe must accept them structurally without casting.
    const parts: Array<{ type: string; error?: unknown }> = [
      { type: "start" },
      { type: "error", error: new Error("model 500") },
    ];
    expect(await probeStreamViability(streamOf(parts))).toBe(
      "failed-before-output",
    );
  });
});
