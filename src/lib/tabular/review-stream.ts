export type TabularReviewStreamEvent =
  | {
      type: "cell";
      itemId: string;
      columnId: string;
      value: string;
      status: "pending" | "generating" | "done" | "error";
    }
  | { type: "complete"; status: "pending" | "generating" | "done" | "error" }
  | { type: "error"; message: string };

function parseEvent(block: string): TabularReviewStreamEvent | undefined {
  const line = block.split(/\r?\n/).find((entry) => entry.startsWith("data:"));
  if (!line) return;
  try {
    const value = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
    if (
      value.type === "cell" &&
      typeof value.itemId === "string" &&
      typeof value.columnId === "string" &&
      typeof value.value === "string" &&
      ["pending", "generating", "done", "error"].includes(String(value.status))
    ) {
      return value as TabularReviewStreamEvent;
    }
    if (
      value.type === "complete" &&
      ["pending", "generating", "done", "error"].includes(String(value.status))
    ) {
      return value as TabularReviewStreamEvent;
    }
    if (value.type === "error" && typeof value.message === "string") {
      return value as TabularReviewStreamEvent;
    }
  } catch {
    // Ignore malformed frames. The final persisted GET remains authoritative.
  }
}

export async function readTabularReviewStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: TabularReviewStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const processFrames = () => {
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseEvent(block);
      if (event) onEvent(event);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    processFrames();
  }
  buffer += decoder.decode();
  processFrames();
  const trailingEvent = parseEvent(buffer);
  if (trailingEvent) onEvent(trailingEvent);
}
