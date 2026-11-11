import { describe, expect, it } from "vitest";
import {
  CHAT_PAYLOAD_CIPHER_ALGORITHM,
  CHAT_PAYLOAD_CIPHER_VERSION,
  decryptChatPayload,
  encryptChatPayload,
} from "./chat-payload-obfuscation";

const CHALLENGE_TOKEN = "challenge-token-used-as-envelope-key";
const PAYLOAD = {
  id: "thread-1",
  toolChoice: "none",
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  },
};

function flipHexChar(hex: string): string {
  const replacement = hex.endsWith("0") ? "1" : "0";
  return `${hex.slice(0, -1)}${replacement}`;
}

describe("chat payload obfuscation", () => {
  it("round-trips an encrypted payload through the challenge-token key", async () => {
    const encrypted = await encryptChatPayload({
      payload: PAYLOAD,
      challengeToken: CHALLENGE_TOKEN,
    });

    expect(encrypted.version).toBe(CHAT_PAYLOAD_CIPHER_VERSION);
    expect(encrypted.algorithm).toBe(CHAT_PAYLOAD_CIPHER_ALGORITHM);
    expect(encrypted.salt).toMatch(/^[a-fA-F0-9]{32}$/);
    expect(encrypted.iv).toMatch(/^[a-fA-F0-9]{24}$/);
    expect(encrypted.ciphertext).toMatch(/^[a-fA-F0-9]+$/);

    await expect(
      decryptChatPayload({
        encryptedPayload: encrypted,
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).resolves.toEqual(PAYLOAD);
  });

  it("rejects a tampered ciphertext via the GCM auth tag", async () => {
    const encrypted = await encryptChatPayload({
      payload: PAYLOAD,
      challengeToken: CHALLENGE_TOKEN,
    });

    await expect(
      decryptChatPayload({
        encryptedPayload: {
          ...encrypted,
          ciphertext: flipHexChar(encrypted.ciphertext),
        },
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).rejects.toThrow();
  });

  it("rejects a tampered salt and iv", async () => {
    const encrypted = await encryptChatPayload({
      payload: PAYLOAD,
      challengeToken: CHALLENGE_TOKEN,
    });

    await expect(
      decryptChatPayload({
        encryptedPayload: { ...encrypted, salt: flipHexChar(encrypted.salt) },
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).rejects.toThrow();

    await expect(
      decryptChatPayload({
        encryptedPayload: { ...encrypted, iv: flipHexChar(encrypted.iv) },
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).rejects.toThrow();
  });

  it("rejects decryption with the wrong challenge token", async () => {
    const encrypted = await encryptChatPayload({
      payload: PAYLOAD,
      challengeToken: CHALLENGE_TOKEN,
    });

    await expect(
      decryptChatPayload({
        encryptedPayload: encrypted,
        challengeToken: "a-different-challenge-token-value",
      }),
    ).rejects.toThrow();
  });

  it("rejects unsupported versions and algorithms before decryption", async () => {
    const encrypted = await encryptChatPayload({
      payload: PAYLOAD,
      challengeToken: CHALLENGE_TOKEN,
    });

    await expect(
      decryptChatPayload({
        encryptedPayload: {
          ...encrypted,
          version: 2 as unknown as typeof encrypted.version,
        },
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).rejects.toThrow("Unsupported encrypted payload version.");

    await expect(
      decryptChatPayload({
        encryptedPayload: {
          ...encrypted,
          algorithm: "aes-128-cbc-v1" as unknown as typeof encrypted.algorithm,
        },
        challengeToken: CHALLENGE_TOKEN,
      }),
    ).rejects.toThrow("Unsupported encrypted payload algorithm.");
  });
});
