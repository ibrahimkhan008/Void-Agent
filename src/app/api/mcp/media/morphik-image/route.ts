import { getSession } from "auth/server";
import {
  inspectRasterImage,
  validateMorphikImageUrl,
} from "lib/ai/mcp/morphik-media";
import { resolveMorphikImageReference } from "lib/ai/mcp/morphik-media-reference";
import { fetchUserModelProvider } from "lib/ai/user-model-provider-transport";
import { readBoundedJsonRequest } from "lib/http/bounded-json-request";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 512 * 1024;
const ImageRequestSchema = z.union([
  z.object({ ref: z.string().min(1).max(12_000) }).strict(),
  z.object({ url: z.string().max(4_096) }).strict(),
]);
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: PRIVATE_HEADERS },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return jsonError("Invalid origin", 403);

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return jsonError("Unauthorized", 401);

  const rate = await checkApiRateLimit({
    kind: "morphik-image-preview",
    id: userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return jsonError("Rate limit exceeded", 429);

  const body = await readBoundedJsonRequest(request, 8 * 1024);
  if (!body.ok) return jsonError(body.error, body.status);
  const parsed = ImageRequestSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("Invalid image URL", 400);
  const imageUrl =
    "ref" in parsed.data
      ? resolveMorphikImageReference(parsed.data.ref, userId)
      : validateMorphikImageUrl(parsed.data.url);
  if (!imageUrl) return jsonError("Unsupported image URL", 400);

  try {
    const upstream = await fetchUserModelProvider(
      imageUrl,
      { method: "GET", headers: { Accept: "image/png,image/jpeg,image/webp" } },
      MAX_IMAGE_BYTES,
      5_000,
    );
    if (upstream.status !== 200 || !upstream.body) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonError("Image preview unavailable", 502);
    }
    const declaredLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await upstream.body.cancel().catch(() => undefined);
      return jsonError("Image exceeds the size limit", 413);
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader
            .cancel("Image exceeds the size limit")
            .catch(() => undefined);
          return jsonError("Image exceeds the size limit", 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const mimeType = inspectRasterImage(
      bytes,
      upstream.headers.get("content-type"),
    );
    if (!mimeType) return jsonError("Unsupported or invalid image data", 415);

    return new Response(bytes, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch {
    // Never log or echo a signed URL or upstream error text.
    return jsonError("Image preview unavailable", 502);
  }
}
