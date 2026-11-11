import { describe, expect, it } from "vitest";
import { FileSizeLimitError, readStreamWithLimit } from "./limited-download";

describe("readStreamWithLimit", () => {
  it("collects content at the byte limit", async () => {
    const stream = (async function* () {
      yield Buffer.from("ab");
      yield Buffer.from("cd");
    })();
    await expect(readStreamWithLimit(stream, 4)).resolves.toEqual(
      Buffer.from("abcd"),
    );
  });

  it("stops reading and rejects when a stream exceeds the limit", async () => {
    let readCount = 0;
    const stream = (async function* () {
      readCount += 1;
      yield Buffer.from("123");
      readCount += 1;
      yield Buffer.from("456");
      readCount += 1;
      yield Buffer.from("unreachable");
    })();

    await expect(readStreamWithLimit(stream, 5)).rejects.toBeInstanceOf(
      FileSizeLimitError,
    );
    expect(readCount).toBe(2);
  });

  it("rejects invalid byte limits", async () => {
    const empty = (async function* () {})();
    await expect(readStreamWithLimit(empty, -1)).rejects.toThrow(
      "maxBytes must be a non-negative safe integer",
    );
  });
});
