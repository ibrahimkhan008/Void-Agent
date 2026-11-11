import { describe, expect, it } from "vitest";
import {
  type EncryptedChatPayload,
  encryptChatPayload,
} from "./chat-payload-obfuscation";
import { resolveEncryptedChatRequestBody } from "./chat-payload-obfuscation.server";

const ENVELOPE_TOKEN = "challenge-token-used-as-envelope-key";
const OTHER_TOKEN = "a-different-challenge-token-value";

const SECURITY = {
  version: 1,
  challengeId: "a".repeat(32),
  challengeToken: ENVELOPE_TOKEN,
  difficulty: 7,
  powNonce: "test.0",
  powHash: "b".repeat(64),
  requestHash: "c".repeat(64),
  requestMac: "d".repeat(64),
  captchaToken: "",
  clientId: "client-1234567890123456",
  clientPublicKey: "A".repeat(120),
  clientProof: "p".repeat(64),
  solvedAt: Date.now(),
};

const PLAINTEXT_BODY = {
  id: "thread-1",
  toolChoice: "none",
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  },
};

async function buildEnvelope({
  payload = PLAINTEXT_BODY,
  encryptionToken = ENVELOPE_TOKEN,
  security = SECURITY,
  encryptedPayloadOverrides,
}: {
  payload?: Record<string, unknown>;
  encryptionToken?: string;
  security?: typeof SECURITY;
  encryptedPayloadOverrides?: Partial<EncryptedChatPayload>;
} = {}) {
  const encryptedPayload = await encryptChatPayload({
    payload,
    challengeToken: encryptionToken,
  });
  return {
    security,
    encryptedPayload: { ...encryptedPayload, ...encryptedPayloadOverrides },
  };
}

describe("resolveEncryptedChatRequestBody", () => {
  it("passes plaintext bodies through unchanged", async () => {
    await expect(
      resolveEncryptedChatRequestBody(PLAINTEXT_BODY),
    ).resolves.toEqual({ ok: true, body: PLAINTEXT_BODY });

    // Headless/system-task callers and dev-mode sends may not even be
    // objects; the resolver must not reject them.
    await expect(resolveEncryptedChatRequestBody(null)).resolves.toEqual({
      ok: true,
      body: null,
    });
    await expect(resolveEncryptedChatRequestBody("text")).resolves.toEqual({
      ok: true,
      body: "text",
    });
  });

  it("decrypts a valid envelope and re-attaches the security payload", async () => {
    const envelope = await buildEnvelope();

    const result = await resolveEncryptedChatRequestBody(envelope);

    expect(result).toEqual({
      ok: true,
      body: { ...PLAINTEXT_BODY, security: SECURITY },
    });
  });

  it("rejects malformed envelopes with 400 invalid-encrypted-payload", async () => {
    const envelope = await buildEnvelope();

    const malformedEnvelopes = [
      // Missing security.
      { encryptedPayload: envelope.encryptedPayload },
      // Missing encryptedPayload fields / bad hex shapes.
      { security: envelope.security, encryptedPayload: {} },
      {
        security: envelope.security,
        encryptedPayload: { ...envelope.encryptedPayload, salt: "zz" },
      },
      {
        security: envelope.security,
        encryptedPayload: {
          ...envelope.encryptedPayload,
          salt: envelope.encryptedPayload.salt.slice(0, 31),
        },
      },
      {
        security: envelope.security,
        encryptedPayload: {
          ...envelope.encryptedPayload,
          iv: envelope.encryptedPayload.iv.slice(0, 23),
        },
      },
      {
        security: envelope.security,
        encryptedPayload: {
          ...envelope.encryptedPayload,
          algorithm: "aes-128-cbc-v1",
        },
      },
      {
        security: envelope.security,
        encryptedPayload: { ...envelope.encryptedPayload, version: 2 },
      },
      // A body that merely claims an encryptedPayload with junk content.
      { security: envelope.security, encryptedPayload: "not-an-object" },
    ];

    for (const malformed of malformedEnvelopes) {
      await expect(resolveEncryptedChatRequestBody(malformed)).resolves.toEqual(
        {
          ok: false,
          status: 400,
          code: "invalid-encrypted-payload",
          message: "Invalid encrypted request payload.",
        },
      );
    }
  });

  it("rejects a security payload that fails the chat security schema", async () => {
    const envelope = await buildEnvelope({
      security: { ...SECURITY, requestHash: "not-hex" },
    });

    await expect(resolveEncryptedChatRequestBody(envelope)).resolves.toEqual({
      ok: false,
      status: 400,
      code: "invalid-encrypted-payload",
      message: "Invalid encrypted request payload.",
    });
  });

  it("rejects a tampered ciphertext with 400 encrypted-payload-decrypt-failed", async () => {
    const envelope = await buildEnvelope({
      encryptedPayloadOverrides: {
        ciphertext: `${"0".repeat(62)}ff`,
      },
    });

    await expect(resolveEncryptedChatRequestBody(envelope)).resolves.toEqual({
      ok: false,
      status: 400,
      code: "encrypted-payload-decrypt-failed",
      message: "Unable to decrypt chat payload. Please retry.",
    });
  });

  it("rejects an envelope whose security token does not match the encryption key", async () => {
    const envelope = await buildEnvelope({ encryptionToken: OTHER_TOKEN });

    await expect(resolveEncryptedChatRequestBody(envelope)).resolves.toEqual({
      ok: false,
      status: 400,
      code: "encrypted-payload-decrypt-failed",
      message: "Unable to decrypt chat payload. Please retry.",
    });
  });

  it("rejects a tampered salt and iv at the resolver boundary", async () => {
    const saltTampered = await buildEnvelope({
      encryptedPayloadOverrides: {
        salt: `${"0".repeat(30)}ff`,
      },
    });
    await expect(
      resolveEncryptedChatRequestBody(saltTampered),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      code: "encrypted-payload-decrypt-failed",
      message: "Unable to decrypt chat payload. Please retry.",
    });

    const ivTampered = await buildEnvelope({
      encryptedPayloadOverrides: {
        iv: `${"0".repeat(22)}ff`,
      },
    });
    await expect(resolveEncryptedChatRequestBody(ivTampered)).resolves.toEqual({
      ok: false,
      status: 400,
      code: "encrypted-payload-decrypt-failed",
      message: "Unable to decrypt chat payload. Please retry.",
    });
  });
});
