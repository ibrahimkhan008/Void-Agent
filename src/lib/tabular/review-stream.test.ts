import { describe, expect, it } from "vitest";
import { readTabularReviewStream } from "./review-stream";

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("tabular review stream", () => {
  it("reads partial SSE frames and emits persisted cell/completion events", async () => {
    const events: unknown[] = [];
    const frame =
      'data: {"type":"cell","itemId":"item-1","columnId":"summary","value":"Done","status":"done"}\n\ndata: {"type":"complete","status":"done"}\n\n';
    await readTabularReviewStream(
      streamOf([frame.slice(0, 35), frame.slice(35)]),
      (event) => events.push(event),
    );
    expect(events).toEqual([
      {
        type: "cell",
        itemId: "item-1",
        columnId: "summary",
        value: "Done",
        status: "done",
      },
      { type: "complete", status: "done" },
    ]);
  });

  it("ignores malformed or structurally invalid frames", async () => {
    const events: unknown[] = [];
    await readTabularReviewStream(
      streamOf([
        "data: not-json\n\n",
        'data: {"type":"cell","itemId":"x","columnId":"y","value":"z","status":"unsafe"}\n\n',
        'data: {"type":"error","message":"Retry available"}',
      ]),
      (event) => events.push(event),
    );
    expect(events).toEqual([{ type: "error", message: "Retry available" }]);
  });
});
