import { readBoundedRequestBody } from "./bounded-request-body";

export type BoundedJsonRequestResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

export async function readBoundedJsonRequest(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonRequestResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, status: 415, error: "Expected a JSON request body" };
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, maxBytes);
  } catch {
    return { ok: false, status: 400, error: "Invalid request body" };
  }
  if (bytes === null) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}
