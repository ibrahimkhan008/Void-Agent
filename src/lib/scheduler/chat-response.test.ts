import { describe, expect, it } from "vitest";

import { inspectScheduledChatResponse } from "./chat-response";

const response = (
  body: string | null,
  options: { status?: number; contentType?: string } = {},
) =>
  new Response(body, {
    status: options.status ?? 200,
    headers:
      options.contentType === undefined
        ? {}
        : { "content-type": options.contentType },
  });

const finish = (finishReason = "stop", blockedReason?: string) =>
  `data: ${JSON.stringify({
    type: "finish",
    finishReason,
    messageMetadata: blockedReason
      ? { blocked: { reason: blockedReason } }
      : {},
  })}\n\n`;

describe("inspectScheduledChatResponse", () => {
  it("accepts only a terminal successful stop frame", async () => {
    const result = await inspectScheduledChatResponse(
      response(`data: {"type":"text-delta","delta":"done"}\n\n${finish()}`, {
        contentType: "text/event-stream; charset=utf-8",
      }),
    );

    expect(result).toEqual({ success: true, finishReason: "stop" });
  });

  it.each([
    ["redirect", 302, "text/event-stream", "", "chat-api-redirect"],
    [
      "HTML auth bounce",
      200,
      "text/html",
      "<html>sign in</html>",
      "chat-api-invalid-content-type",
    ],
    [
      "missing event content type",
      200,
      undefined,
      finish(),
      "chat-api-invalid-content-type",
    ],
    [
      "server rejection",
      503,
      "application/json",
      "private error",
      "chat-api-503",
    ],
  ] as const)("rejects %s", async (_name, status, contentType, body, error) => {
    const result = await inspectScheduledChatResponse(
      response(body, { status, ...(contentType ? { contentType } : {}) }),
    );
    expect(result).toEqual({ success: false, error });
  });

  it("rejects a response with no body", async () => {
    const result = await inspectScheduledChatResponse(
      new Response(null, { headers: { "content-type": "text/event-stream" } }),
    );
    expect(result).toEqual({ success: false, error: "chat-stream-missing" });
  });

  it.each([
    ["truncated stream", 'data: {"type":"text-delta","delta":"partial"}\n\n'],
    ["malformed terminal data", 'data: {"type":"finish","finishReason":\n\n'],
  ])("rejects %s without a parseable terminal frame", async (_name, body) => {
    const result = await inspectScheduledChatResponse(
      response(body, { contentType: "text/event-stream" }),
    );
    expect(result).toEqual({ success: false, error: "chat-stream-incomplete" });
  });

  it.each([
    [
      "approval-blocked",
      finish("stop", "Approval required"),
      "chat-run-blocked",
    ],
    ["error finish", finish("error"), "chat-run-error"],
    [
      "tool call without answer",
      finish("tool-calls"),
      "chat-run-finish-tool-calls",
    ],
    ["truncated output", finish("length"), "chat-run-finish-length"],
    ["unknown finish", finish("other"), "chat-run-finish-other"],
  ])("rejects %s", async (_name, body, error) => {
    const result = await inspectScheduledChatResponse(
      response(body, { contentType: "text/event-stream" }),
    );
    expect(result).toEqual({ success: false, error });
  });

  it("stops and rejects a stream that exceeds its byte budget", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(32)));
      },
      cancel() {
        canceled = true;
      },
    });
    const result = await inspectScheduledChatResponse(
      new Response(body, { headers: { "content-type": "text/event-stream" } }),
      { maxBytes: 16 },
    );
    expect(result).toEqual({ success: false, error: "chat-stream-too-large" });
    expect(canceled).toBe(true);
  });

  it("cancels a stream that does not finish before the elapsed-time limit", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start() {},
      cancel() {
        canceled = true;
      },
    });
    const result = await inspectScheduledChatResponse(
      new Response(body, { headers: { "content-type": "text/event-stream" } }),
      { timeoutMs: 5 },
    );
    expect(result).toEqual({ success: false, error: "chat-stream-timeout" });
    expect(canceled).toBe(true);
  });
});
