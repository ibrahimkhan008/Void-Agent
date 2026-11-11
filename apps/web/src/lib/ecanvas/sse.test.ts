import { describe, expect, it } from "vitest";
import { encodeCanvasDone, encodeCanvasEvent } from "./sse";

describe("canvas SSE encoding", () => {
  it("encodes events as JSON data frames", () => {
    expect(
      new TextDecoder().decode(
        encodeCanvasEvent({ type: "chunk", text: "hi" }),
      ),
    ).toBe('data: {"type":"chunk","text":"hi"}\n\n');
  });

  it("encodes the stream terminator as the SSE sentinel", () => {
    expect(new TextDecoder().decode(encodeCanvasDone())).toBe(
      "data: [DONE]\n\n",
    );
  });
});
