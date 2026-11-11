import { getSuccessfulNewChatPath } from "./new-chat-navigation";

type ChatTransportFetchOptions = {
  threadId: string;
  isNewChat: boolean;
  getPathname: () => string;
  replacePath: (path: string) => void;
  fetchImpl?: typeof globalThis.fetch;
};

/**
 * Commit a new chat URL after its first POST succeeds with a streaming body.
 * Pass the SDK's original request and init through unchanged so credentials,
 * body, headers, and cancellation signal retain their existing behavior.
 */
export function createChatTransportFetch({
  threadId,
  isNewChat,
  getPathname,
  replacePath,
  fetchImpl = globalThis.fetch,
}: ChatTransportFetchOptions): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const method = (
      init?.method ??
      (typeof Request !== "undefined" && input instanceof Request
        ? input.method
        : "GET")
    ).toUpperCase();

    if (method === "POST") {
      const path = getSuccessfulNewChatPath({
        pathname: getPathname(),
        threadId,
        responseOk:
          response.ok && !response.redirected && response.body !== null,
        isNewChat,
      });
      if (path) replacePath(path);
    }

    return response;
  };
}
