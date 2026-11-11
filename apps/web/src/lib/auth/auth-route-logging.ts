/** Keep auth failure telemetry useful without recording credentials or tokens. */
export async function getAuthRequestLogContext(request: Request) {
  let bodyKeys: string[] | undefined;
  try {
    const body: unknown = await request.clone().json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      bodyKeys = Object.keys(body).slice(0, 32);
    }
  } catch {
    // Auth endpoints also accept empty and non-JSON request bodies.
  }

  let pathname = "[invalid-url]";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // Never emit query parameters, which can contain reset tokens.
  }
  return {
    method: request.method,
    pathname,
    ...(bodyKeys ? { bodyKeys } : {}),
  };
}

export async function getAuthErrorLogContext(request: Request, error: unknown) {
  return {
    ...(await getAuthRequestLogContext(request)),
    errorType: error instanceof Error ? error.name : typeof error,
  };
}
