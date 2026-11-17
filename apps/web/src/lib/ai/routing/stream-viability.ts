/**
 * Mid-stream fallback viability probe (master prompt §3.1 — "Model fallback
 * and retry"). AI SDK streams are append-only once merged into the UI stream:
 * a retry after content reached the client would duplicate text and repeat
 * tool effects. The one safe retry boundary is BEFORE the first UI chunk —
 * so before merging, the caller tee()s the model stream and probes a mirror
 * branch until it can tell whether the model produced anything.
 *
 * Verdicts:
 * - "failed-before-output": the stream emitted an `error` part before any
 *   content frame. Nothing was shown, no tool ran, nothing persisted — the
 *   whole attempt can be discarded and retried on the next fallback
 *   candidate.
 * - "viable": the stream produced content (or aborted, or completed without
 *   an error). Merge it unchanged; retrying is unsafe or pointless.
 *
 * The probe consumes only control frames (`start`, `start-step`,
 * `finish-step`, `raw`); the first content frame decides the verdict, so at
 * most a couple of chunks are read before the mirror branch is cancelled and
 * the merge begins. A hang is bounded by the streamText chunk timeout, which
 * surfaces as an error part.
 */

export type StreamViability = "viable" | "failed-before-output";

/** Frames that carry neither content nor a verdict — keep probing. */
const CONTROL_FRAMES = new Set(["start", "start-step", "finish-step", "raw"]);

export async function probeStreamViability<T extends { type?: string }>(
  stream: ReadableStream<T>,
): Promise<StreamViability> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const { type } = value;
      if (type === "error") return "failed-before-output";
      if (type && CONTROL_FRAMES.has(type)) continue;
      // Any other frame is content (text, reasoning, tool, data, source,
      // file), an abort, or a finish — output has begun or the run ended on
      // its own; either way the stream merges as-is.
      return "viable";
    }
    // The stream ended without any content frame. A normal completion always
    // emits a `finish` part (caught by the default branch above), so a bare
    // end means the model died before producing anything — exactly the
    // retryable case; the merge never began.
    return "failed-before-output";
  } catch {
    // The pump surfaced a provider failure by erroring the stream (the read
    // rejected). No content ever flowed — the attempt produced nothing and
    // can be retried; the merge never began.
    return "failed-before-output";
  } finally {
    // Cancel the mirror branch: with tee(), cancelling one branch stops
    // buffering for it while the source keeps flowing to the merged branch.
    void reader.cancel().catch(() => {});
  }
}
