const MAX_IMAGE_EDIT_REQUEST_BYTES = 21 * 1024 * 1024;

export class ImageEditRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
  }
}

export async function readImageEditRequest(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_IMAGE_EDIT_REQUEST_BYTES
  ) {
    throw new ImageEditRequestError(
      "Image edit request exceeds the 21 MiB limit.",
      413,
    );
  }
  if (!request.body)
    throw new ImageEditRequestError("Image edit request is empty.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_EDIT_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ImageEditRequestError(
          "Image edit request exceeds the 21 MiB limit.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk)),
        total,
      ),
    );
    return JSON.parse(json) as unknown;
  } catch {
    throw new ImageEditRequestError(
      "Image edit request contains invalid JSON.",
      400,
    );
  }
}

export const IMAGE_EDIT_REQUEST_MAX_BYTES = MAX_IMAGE_EDIT_REQUEST_BYTES;
