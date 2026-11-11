import { createHmac, timingSafeEqual } from "node:crypto";

export interface DodoWebhookSignatureInput {
  rawBody: string;
  secret: string;
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  };
  nowSeconds?: number;
  toleranceSeconds?: number;
}

function decodeWebhookKey(secret: string): Buffer | null {
  if (!secret.startsWith("whsec_") || secret.length > 2_048) return null;
  const encoded = secret.slice("whsec_".length);
  const key = decodeBase64Strict(encoded);
  if (!key || key.length < 16) return null;
  return key;
}

function decodeBase64Strict(encoded: string): Buffer | null {
  if (
    encoded.length === 0 ||
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)
  ) {
    return null;
  }
  const normalized = encoded.replace(/=+$/u, "");
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");
  if (bytes.toString("base64").replace(/=+$/u, "") !== normalized) return null;
  return bytes;
}

function computeSignature(
  key: Buffer,
  id: string,
  timestamp: string,
  body: string,
): Buffer {
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();
}

function constantTimeBase64Equal(candidate: string, expected: Buffer): boolean {
  const candidateBytes = decodeBase64Strict(candidate);
  if (!candidateBytes || candidateBytes.length !== expected.length)
    return false;
  return timingSafeEqual(candidateBytes, expected);
}

/** Verify the original raw request bytes using Standard Webhooks headers. */
export function verifyDodoWebhookSignature(
  input: DodoWebhookSignatureInput,
): boolean {
  const { id, timestamp, signature } = input.headers;
  if (
    !id ||
    !timestamp ||
    !signature ||
    signature.length > 4_096 ||
    !input.secret
  )
    return false;
  if (!/^[\w.-]{1,200}$/u.test(id) || !/^\d{1,16}$/u.test(timestamp))
    return false;
  const timestampSeconds = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(now - timestampSeconds) > tolerance
  )
    return false;

  const key = decodeWebhookKey(input.secret);
  if (!key) return false;
  const expected = computeSignature(key, id, timestamp, input.rawBody);
  const candidates = signature
    .split(/\s+/u)
    .map((entry) => entry.split(","))
    .filter(
      (parts) => parts.length === 2 && parts[0] === "v1" && Boolean(parts[1]),
    )
    .map(([, value]) => value);
  return candidates.some((candidate) =>
    constantTimeBase64Equal(candidate, expected),
  );
}
