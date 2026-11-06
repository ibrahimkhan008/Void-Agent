import { z } from "zod";

export const pushSubscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((value) => value.startsWith("https://")),
    keys: z
      .object({
        p256dh: z.string().min(16).max(256),
        auth: z.string().min(8).max(256),
      })
      .strict(),
  })
  .strict();

export const notificationReadSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(100).optional() })
  .strict();

export const readBoundedJson = async (
  request: Request,
  maxBytes = 8_192,
): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> => {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, tooLarge: true };
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, tooLarge: false };
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
};

export const safeNotificationHref = (href: unknown): string | null => {
  if (
    typeof href !== "string" ||
    href.length > 512 ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(href)
  )
    return null;

  // Browsers treat backslashes as slashes while parsing special-scheme URLs.
  // Check a few decode layers too because framework/router layers may decode
  // path segments before navigation.
  let decoded = href;
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//"))
      return null;
  }

  try {
    const origin = "https://void-agent.invalid";
    return new URL(href, origin).origin === origin ? href : null;
  } catch {
    return null;
  }
};

/** Reject cross-origin browser mutations while allowing authenticated non-browser callers. */
export const isSameOriginRequest = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};
