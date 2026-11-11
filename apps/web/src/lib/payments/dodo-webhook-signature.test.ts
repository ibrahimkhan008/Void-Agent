import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyDodoWebhookSignature } from "./dodo-webhook-signature";

function sign(secret: string, id: string, timestamp: string, body: string) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

describe("verifyDodoWebhookSignature", () => {
  const now = 1_800_000_000;

  it("matches a fixed Standard Webhooks HMAC-SHA256 base64 vector", () => {
    // Fixed vector generated independently from the verifier implementation:
    // key = 20 bytes of 0x0b, signed content = id.1800000000.hello.
    expect(
      verifyDodoWebhookSignature({
        rawBody: "hello",
        secret: "whsec_CwsLCwsLCwsLCwsLCwsLCwsLCws=",
        headers: {
          id: "id",
          timestamp: String(now),
          signature: "v1,SEzJhVcqYijZec57abgP1yTeZj1OxThVmZwdnI4ItDM=",
        },
        nowSeconds: now,
      }),
    ).toBe(true);
    expect(
      verifyDodoWebhookSignature({
        rawBody: "hello",
        secret: "whsec_CwsLCwsLCwsLCwsLCwsLCwsLCws",
        headers: {
          id: "id",
          timestamp: String(now),
          signature: "v1,SEzJhVcqYijZec57abgP1yTeZj1OxThVmZwdnI4ItDM",
        },
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("accepts any matching v1 signature during key rotation and rejects tampering", () => {
    const id = "msg_123";
    const timestamp = String(now);
    const body = '{"type":"payment.succeeded","data":{"payment_id":"pay_1"}}';
    const currentKey = Buffer.alloc(32, 0x22).toString("base64");
    const previousKey = Buffer.alloc(32, 0x11).toString("base64");
    const currentSecret = `whsec_${currentKey}`;
    const previousSecret = `whsec_${previousKey}`;
    const current = sign(currentSecret, id, timestamp, body);
    const previous = sign(previousSecret, id, timestamp, body);
    const input = {
      rawBody: body,
      secret: currentSecret,
      headers: {
        id,
        timestamp,
        signature: `v1,${previous} v1,${current}`,
      },
      nowSeconds: now,
    };
    expect(verifyDodoWebhookSignature(input)).toBe(true);
    expect(verifyDodoWebhookSignature({ ...input, rawBody: `${body} ` })).toBe(
      false,
    );
  });

  it("fails closed for malformed secrets, headers, signatures, and stale timestamps", () => {
    const id = "msg_123";
    const timestamp = String(now);
    const secret = `whsec_${Buffer.alloc(32, 0x22).toString("base64")}`;
    const body = "hello";
    const valid = sign(secret, id, timestamp, body);
    const input = {
      rawBody: body,
      secret,
      headers: { id, timestamp, signature: `v1,${valid}` },
      nowSeconds: now,
    };
    expect(
      verifyDodoWebhookSignature({
        ...input,
        headers: { ...input.headers, id: null },
      }),
    ).toBe(false);
    expect(
      verifyDodoWebhookSignature({
        ...input,
        headers: { ...input.headers, signature: "v1,not-base64!" },
      }),
    ).toBe(false);
    expect(
      verifyDodoWebhookSignature({
        ...input,
        headers: { ...input.headers, timestamp: String(now - 301) },
      }),
    ).toBe(false);
    expect(
      verifyDodoWebhookSignature({ ...input, secret: "webhook-secret" }),
    ).toBe(false);
    expect(
      verifyDodoWebhookSignature({ ...input, secret: "whsec_invalid" }),
    ).toBe(false);
  });
});
