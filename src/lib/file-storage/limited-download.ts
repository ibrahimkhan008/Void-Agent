export class FileSizeLimitError extends Error {
  constructor(maxBytes: number) {
    super(`File exceeds the maximum allowed size of ${maxBytes} bytes`);
    this.name = "FileSizeLimitError";
  }
}

export function assertFileSizeWithinLimit(
  size: number,
  maxBytes: number,
): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) {
    throw new FileSizeLimitError(maxBytes);
  }
}

/** Collect a stream only while its total byte count remains within the limit. */
export async function readStreamWithLimit(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  const accept = (chunk: Uint8Array) => {
    if (chunk.byteLength > maxBytes - total) {
      throw new FileSizeLimitError(maxBytes);
    }
    const copy = Buffer.from(chunk);
    chunks.push(copy);
    total += copy.byteLength;
  };

  if ("getReader" in stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) accept(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
  } else {
    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (true) {
        const { done, value } = await iterator.next();
        if (done) break;
        if (value) accept(value);
      }
    } catch (error) {
      await iterator.return?.();
      throw error;
    }
  }

  return Buffer.concat(chunks, total);
}
