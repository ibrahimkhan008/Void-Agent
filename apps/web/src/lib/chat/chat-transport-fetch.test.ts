import { describe, expect, it, vi } from "vitest";
import { createChatTransportFetch } from "./chat-transport-fetch";

function makeResponse(options?: {
  ok?: boolean;
  redirected?: boolean;
  body?: ReadableStream<Uint8Array> | null;
}) {
  return {
    ok: options?.ok ?? true,
    redirected: options?.redirected ?? false,
    body: options?.body === undefined ? new ReadableStream() : options.body,
  } as Response;
}

describe("chat transport URL promotion", () => {
  it("changes the draft URL after a successful first POST with a stream", async () => {
    const response = makeResponse();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const replacePath = vi.fn();
    const fetch = createChatTransportFetch({
      threadId: "thread / one",
      isNewChat: true,
      getPathname: () => "/",
      replacePath,
      fetchImpl,
    });

    const init = { method: "POST", signal: new AbortController().signal };
    await expect(fetch("/api/chat", init)).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith("/api/chat", init);
    expect(replacePath).toHaveBeenCalledExactlyOnceWith(
      "/chat/thread%20%2F%20one",
    );
  });

  it.each([
    ["failed response", { ok: false }],
    ["redirected response", { redirected: true }],
    ["missing stream", { body: null }],
  ])("keeps the draft URL for a %s", async (_label, responseOptions) => {
    const replacePath = vi.fn();
    const fetch = createChatTransportFetch({
      threadId: "thread-1",
      isNewChat: true,
      getPathname: () => "/",
      replacePath,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(makeResponse(responseOptions)),
    });

    await fetch("/api/chat", { method: "POST" });

    expect(replacePath).not.toHaveBeenCalled();
  });

  it("does not promote existing chats or non-POST requests", async () => {
    const replacePath = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(makeResponse());
    const fetchNew = createChatTransportFetch({
      threadId: "thread-1",
      isNewChat: false,
      getPathname: () => "/chat/thread-1",
      replacePath,
      fetchImpl,
    });
    await fetchNew("/api/chat", { method: "POST" });
    await fetchNew("/api/chat/thread-1/stream", { method: "GET" });

    expect(replacePath).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
