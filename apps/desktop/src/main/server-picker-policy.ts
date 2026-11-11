const MAX_SERVER_CHECK_BYTES = 8_192;

export function isTrustedServerPickerUrl(frameUrl: string): boolean {
  return frameUrl.startsWith("data:text/html;charset=utf-8,");
}

export function isCompatibleServerHealthResponse(input: {
  status: number;
  contentType: string | null;
  body: string;
}): boolean {
  if (
    input.status !== 200 ||
    !input.contentType?.toLowerCase().includes("application/json") ||
    Buffer.byteLength(input.body, "utf8") > MAX_SERVER_CHECK_BYTES
  ) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(input.body);
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).ok === true,
    );
  } catch {
    return false;
  }
}

export function isSameOriginServerResponse(
  origin: string,
  responseUrl: string,
): boolean {
  try {
    return new URL(responseUrl).origin === origin;
  } catch {
    return false;
  }
}

export async function readBoundedServerCheckBody(
  response: Response,
): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SERVER_CHECK_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SERVER_CHECK_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
