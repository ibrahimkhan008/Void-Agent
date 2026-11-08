/** Apply a private no-store cache policy to every returned HTTP response. */
export function withPrivateNoStore<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const response = await handler(...args);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
