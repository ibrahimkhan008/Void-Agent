import { describe, expect, it } from "vitest";
import { FileSizeLimitError, readStreamWithLimit } from "./limited-download";

describe("readStreamWithLimit", () => {
  it("collects a stream exactly at the configured limit", async () => {
    const result = await readStreamWithLimit(
      (async function* () {
        yield Buffer.from("ab");
        yield Buffer.from("cd");
      })(),
      4,
    );

    expect(result.toString()).toBe("abcd");
  });

  it("stops reading as soon as a chunk would exceed the limit", async () => {
    let chunksYielded = 0;
    const source = (async function* () {
      chunksYielded += 1;
      yield Buffer.alloc(4);
      chunksYielded += 1;
      yield Buffer.alloc(2);
      chunksYielded += 1;
      yield Buffer.alloc(100 * 1024 * 1024);
    })();

    await expect(readStreamWithLimit(source, 5)).rejects.toBeInstanceOf(
      FileSizeLimitError,
    );
    expect(chunksYielded).toBe(2);
  });

  it("cancels web streams after crossing the limit", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(Buffer.alloc(6));
      },
      cancel() {
        canceled = true;
      },
    });

    await expect(readStreamWithLimit(stream, 5)).rejects.toBeInstanceOf(
      FileSizeLimitError,
    );
    expect(canceled).toBe(true);
  });
});
